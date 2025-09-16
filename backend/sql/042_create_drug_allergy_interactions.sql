-- Migration: Create drug_allergy_interactions table for clinical decision support
-- This table links medication ingredients to allergy substances for real-time checking

CREATE TABLE drug_allergy_interactions (
    id SERIAL PRIMARY KEY,
    
    -- Medication and allergy substance linking
    medication_id INTEGER NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
    allergy_substance VARCHAR(255) NOT NULL, -- substance that triggers the allergy
    ingredient VARCHAR(255) NOT NULL, -- specific ingredient in medication that causes reaction
    
    -- Interaction severity and clinical information
    severity_level VARCHAR(20) NOT NULL CHECK (severity_level IN (
        'mild', 'moderate', 'severe', 'life_threatening'
    )),
    
    reaction_type VARCHAR(100), -- type of expected reaction (rash, anaphylaxis, etc.)
    cross_sensitivity BOOLEAN DEFAULT false, -- if related substances may also cause reactions
    
    -- Clinical details
    description TEXT NOT NULL, -- description of the interaction
    clinical_manifestation TEXT, -- what symptoms/signs to expect
    contraindicated BOOLEAN DEFAULT false, -- absolute contraindication vs. caution
    
    -- Alternative medication recommendations
    alternative_medication_ids INTEGER[], -- array of alternative medication IDs
    alternative_notes TEXT, -- notes about alternatives
    
    -- Evidence and metadata
    evidence_level VARCHAR(20) CHECK (evidence_level IN (
        'theoretical', 'case_report', 'clinical_study', 'established'
    )) DEFAULT 'established',
    
    onset_timing VARCHAR(20) CHECK (onset_timing IN (
        'immediate', 'rapid', 'delayed', 'variable'
    )) DEFAULT 'variable',
    
    -- Status and source information
    active BOOLEAN DEFAULT true,
    source VARCHAR(255), -- data source (drug database, clinical literature, etc.)
    last_reviewed DATE DEFAULT CURRENT_DATE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure unique medication-substance pairs
    CONSTRAINT unique_med_allergy_pair UNIQUE (medication_id, allergy_substance, ingredient)
);

-- Create indexes for efficient allergy checking
CREATE INDEX idx_drug_allergy_medication ON drug_allergy_interactions(medication_id);
CREATE INDEX idx_drug_allergy_substance ON drug_allergy_interactions(allergy_substance);
CREATE INDEX idx_drug_allergy_ingredient ON drug_allergy_interactions(ingredient);
CREATE INDEX idx_drug_allergy_severity ON drug_allergy_interactions(severity_level);
CREATE INDEX idx_drug_allergy_active ON drug_allergy_interactions(active) WHERE active = true;
CREATE INDEX idx_drug_allergy_contraindicated ON drug_allergy_interactions(contraindicated) WHERE contraindicated = true;

-- Composite indexes for real-time checking queries
CREATE INDEX idx_drug_allergy_lookup ON drug_allergy_interactions(medication_id, active) WHERE active = true;
CREATE INDEX idx_drug_allergy_substance_active ON drug_allergy_interactions(allergy_substance, active) WHERE active = true;

-- Full-text search index for substance/ingredient matching
CREATE INDEX idx_drug_allergy_text_search ON drug_allergy_interactions 
    USING gin(to_tsvector('english', allergy_substance || ' ' || ingredient));

-- Trigger for updated_at
CREATE TRIGGER update_drug_allergy_interactions_updated_at 
    BEFORE UPDATE ON drug_allergy_interactions 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Insert common drug-allergy interactions
INSERT INTO drug_allergy_interactions (
    medication_id, allergy_substance, ingredient, severity_level, reaction_type,
    description, clinical_manifestation, contraindicated, alternative_notes,
    evidence_level, onset_timing
) VALUES
    -- Penicillin allergy interactions
    (
        (SELECT id FROM medications WHERE generic_name ILIKE '%amoxicillin%' LIMIT 1),
        'penicillin', 'amoxicillin', 'severe',
        'hypersensitivity',
        'Penicillin-allergic patients may have cross-reactivity with amoxicillin.',
        'Skin rash, urticaria, bronchospasm, anaphylaxis in severe cases.',
        true,
        'Consider cephalexin (if no severe penicillin allergy), azithromycin, or clindamycin as alternatives.',
        'established', 'rapid'
    ),
    
    (
        (SELECT id FROM medications WHERE generic_name ILIKE '%ampicillin%' LIMIT 1),
        'penicillin', 'ampicillin', 'severe',
        'hypersensitivity',
        'Cross-reactivity expected in penicillin-allergic patients.',
        'Similar to other beta-lactam reactions: rash, urticaria, potential anaphylaxis.',
        true,
        'Use macrolides, fluoroquinolones, or other non-beta-lactam antibiotics.',
        'established', 'rapid'
    ),
    
    -- Sulfa allergy interactions
    (
        (SELECT id FROM medications WHERE generic_name ILIKE '%sulfamethoxazole%' OR generic_name ILIKE '%trimethoprim%' LIMIT 1),
        'sulfa', 'sulfamethoxazole', 'moderate',
        'hypersensitivity',
        'Sulfa-containing antibiotics contraindicated in patients with sulfa allergies.',
        'Stevens-Johnson syndrome, skin rash, fever, potential liver toxicity.',
        true,
        'Use alternative antibiotics like doxycycline, azithromycin, or fluoroquinolones.',
        'established', 'delayed'
    ),
    
    -- NSAID/Aspirin allergy interactions
    (
        (SELECT id FROM medications WHERE generic_name ILIKE '%ibuprofen%' LIMIT 1),
        'aspirin', 'ibuprofen', 'moderate',
        'cross_sensitivity',
        'Cross-sensitivity between aspirin and other NSAIDs is common.',
        'Bronchospasm, urticaria, angioedema, especially in asthmatic patients.',
        false,
        'Acetaminophen is generally safe alternative. COX-2 inhibitors may be considered with caution.',
        'established', 'rapid'
    ),
    
    (
        (SELECT id FROM medications WHERE generic_name ILIKE '%naproxen%' LIMIT 1),
        'aspirin', 'naproxen', 'moderate',
        'cross_sensitivity',
        'NSAIDs may cause similar reactions in aspirin-sensitive patients.',
        'Respiratory symptoms, skin reactions, gastrointestinal upset.',
        false,
        'Acetaminophen recommended as first-line alternative for pain/fever.',
        'established', 'rapid'
    ),
    
    -- Statin muscle sensitivity
    (
        (SELECT id FROM medications WHERE generic_name ILIKE '%atorvastatin%' LIMIT 1),
        'statin', 'atorvastatin', 'mild',
        'muscle_toxicity',
        'Patients with previous statin-induced muscle symptoms may react to other statins.',
        'Muscle pain, weakness, elevated CK levels, potential rhabdomyolysis.',
        false,
        'Try different statin at lower dose, or consider ezetimibe, PCSK9 inhibitors.',
        'established', 'delayed'
    ),
    
    (
        (SELECT id FROM medications WHERE generic_name ILIKE '%simvastatin%' LIMIT 1),
        'statin', 'simvastatin', 'mild',
        'muscle_toxicity',
        'Cross-reactivity possible among all statins for muscle-related adverse effects.',
        'Myalgia, myositis, rarely rhabdomyolysis.',
        false,
        'Alternative lipid-lowering agents: ezetimibe, bile acid sequestrants, fibrates.',
        'established', 'delayed'
    ),
    
    -- ACE Inhibitor cough/angioedema
    (
        (SELECT id FROM medications WHERE generic_name ILIKE '%lisinopril%' LIMIT 1),
        'ace inhibitor', 'lisinopril', 'moderate',
        'angioedema',
        'ACE inhibitor-induced angioedema is a class effect.',
        'Lip, tongue, throat swelling; dry cough is more common but less serious.',
        true,
        'ARBs (losartan, valsartan) are preferred alternatives with lower angioedema risk.',
        'established', 'variable'
    ),
    
    (
        (SELECT id FROM medications WHERE generic_name ILIKE '%enalapril%' LIMIT 1),
        'ace inhibitor', 'enalapril', 'moderate',
        'angioedema',
        'All ACE inhibitors carry risk of angioedema in susceptible patients.',
        'Facial swelling, difficulty breathing, throat tightness.',
        true,
        'Switch to ARB or alternative antihypertensive class.',
        'established', 'variable'
    ),
    
    -- Contrast dye allergies
    (
        (SELECT id FROM medications WHERE generic_name ILIKE '%iodine%' OR brand_name ILIKE '%contrast%' LIMIT 1),
        'iodine', 'iodinated contrast', 'severe',
        'hypersensitivity',
        'Previous iodinated contrast reactions indicate high risk for repeat reactions.',
        'Urticaria, bronchospasm, hypotension, anaphylaxis.',
        false,
        'Pre-medication with corticosteroids and antihistamines, or use gadolinium-based alternatives.',
        'established', 'immediate'
    );

-- Function to check for drug-allergy interactions
CREATE OR REPLACE FUNCTION check_drug_allergy_interactions(
    p_medication_id INTEGER,
    p_patient_allergies TEXT[]
) RETURNS TABLE (
    interaction_id INTEGER,
    severity_level VARCHAR(20),
    allergy_substance VARCHAR(255),
    ingredient VARCHAR(255),
    description TEXT,
    clinical_manifestation TEXT,
    contraindicated BOOLEAN,
    alternative_notes TEXT,
    alternative_medication_ids INTEGER[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        dai.id,
        dai.severity_level,
        dai.allergy_substance,
        dai.ingredient,
        dai.description,
        dai.clinical_manifestation,
        dai.contraindicated,
        dai.alternative_notes,
        dai.alternative_medication_ids
    FROM drug_allergy_interactions dai
    WHERE dai.medication_id = p_medication_id
      AND dai.active = true
      AND dai.allergy_substance = ANY(p_patient_allergies)
    ORDER BY 
        CASE dai.severity_level 
            WHEN 'life_threatening' THEN 4
            WHEN 'severe' THEN 3
            WHEN 'moderate' THEN 2
            WHEN 'mild' THEN 1
        END DESC,
        dai.contraindicated DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get alternative medications for a given medication
CREATE OR REPLACE FUNCTION get_alternative_medications(
    p_medication_id INTEGER,
    p_drug_class VARCHAR(100) DEFAULT NULL
) RETURNS TABLE (
    medication_id INTEGER,
    generic_name VARCHAR(255),
    brand_name VARCHAR(255),
    drug_class VARCHAR(100),
    dosage_form VARCHAR(50),
    strength VARCHAR(100)
) AS $$
BEGIN
    -- First try to get alternatives from drug_allergy_interactions table
    IF EXISTS (
        SELECT 1 FROM drug_allergy_interactions 
        WHERE medication_id = p_medication_id 
          AND alternative_medication_ids IS NOT NULL
          AND array_length(alternative_medication_ids, 1) > 0
    ) THEN
        RETURN QUERY
        SELECT DISTINCT
            m.id,
            m.generic_name,
            m.brand_name,
            m.drug_class,
            m.dosage_form,
            m.strength
        FROM medications m
        WHERE m.id = ANY(
            SELECT unnest(dai.alternative_medication_ids)
            FROM drug_allergy_interactions dai
            WHERE dai.medication_id = p_medication_id
              AND dai.alternative_medication_ids IS NOT NULL
        )
        AND m.active = true
        ORDER BY m.generic_name;
    ELSE
        -- Fall back to same drug class alternatives
        RETURN QUERY
        SELECT 
            m.id,
            m.generic_name,
            m.brand_name,
            m.drug_class,
            m.dosage_form,
            m.strength
        FROM medications m
        WHERE m.drug_class = COALESCE(
            p_drug_class,
            (SELECT drug_class FROM medications WHERE id = p_medication_id)
        )
        AND m.id != p_medication_id
        AND m.active = true
        ORDER BY m.generic_name
        LIMIT 10;
    END IF;
END;
$$ LANGUAGE plpgsql;