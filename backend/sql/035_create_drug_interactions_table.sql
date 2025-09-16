-- Migration: Create drug interactions table for medication safety checking
-- This table stores known drug-drug interactions for clinical decision support

CREATE TABLE drug_interactions (
    id SERIAL PRIMARY KEY,
    
    -- Drug information (both directions of interaction)
    medication_1_id INTEGER NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
    medication_2_id INTEGER NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
    
    -- Interaction details
    interaction_type VARCHAR(50) NOT NULL CHECK (interaction_type IN (
        'major', 'moderate', 'minor', 'contraindicated'
    )),
    
    severity_level INTEGER NOT NULL CHECK (severity_level BETWEEN 1 AND 5), -- 1=minor, 5=life threatening
    
    -- Clinical information
    description TEXT NOT NULL, -- what happens when these drugs interact
    mechanism TEXT, -- how the interaction occurs (pharmacokinetic, pharmacodynamic)
    clinical_effect TEXT, -- clinical consequences
    management TEXT, -- how to manage the interaction
    
    -- Evidence and references
    evidence_level VARCHAR(20) CHECK (evidence_level IN (
        'theoretical', 'case_report', 'study', 'established'
    )),
    
    onset VARCHAR(20) CHECK (onset IN (
        'rapid', 'delayed', 'unknown'
    )),
    
    -- Metadata
    active BOOLEAN DEFAULT true,
    source VARCHAR(100), -- where the interaction data came from
    last_reviewed DATE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure we don't have duplicate interactions (A-B same as B-A)
    CONSTRAINT unique_drug_pair UNIQUE (medication_1_id, medication_2_id),
    CONSTRAINT no_self_interaction CHECK (medication_1_id != medication_2_id)
);

-- Create indexes for efficient interaction lookups
CREATE INDEX idx_drug_interactions_med1 ON drug_interactions(medication_1_id);
CREATE INDEX idx_drug_interactions_med2 ON drug_interactions(medication_2_id);
CREATE INDEX idx_drug_interactions_severity ON drug_interactions(severity_level);
CREATE INDEX idx_drug_interactions_type ON drug_interactions(interaction_type);
CREATE INDEX idx_drug_interactions_active ON drug_interactions(active) WHERE active = true;

-- Composite index for interaction checking queries
CREATE INDEX idx_drug_interactions_lookup ON drug_interactions(medication_1_id, medication_2_id, active);

-- Trigger for updated_at
CREATE TRIGGER update_drug_interactions_updated_at 
    BEFORE UPDATE ON drug_interactions 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Function to ensure consistent drug pair ordering (smaller ID first)
CREATE OR REPLACE FUNCTION normalize_drug_interaction_pair() 
RETURNS TRIGGER AS $$
BEGIN
    -- Always store the smaller medication_id first for consistent lookups
    IF NEW.medication_1_id > NEW.medication_2_id THEN
        -- Swap the medications
        DECLARE
            temp_id INTEGER;
        BEGIN
            temp_id := NEW.medication_1_id;
            NEW.medication_1_id := NEW.medication_2_id;
            NEW.medication_2_id := temp_id;
        END;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trig_normalize_drug_interaction_pair
    BEFORE INSERT OR UPDATE ON drug_interactions
    FOR EACH ROW EXECUTE FUNCTION normalize_drug_interaction_pair();

-- Insert common drug interactions
INSERT INTO drug_interactions (
    medication_1_id, medication_2_id, interaction_type, severity_level,
    description, mechanism, clinical_effect, management, evidence_level, onset
) VALUES
    -- Warfarin interactions (using medication IDs - these would need to be adjusted based on actual IDs)
    -- ACE Inhibitor + NSAID
    (
        (SELECT id FROM medications WHERE generic_name = 'lisinopril' AND strength = '10mg' LIMIT 1),
        (SELECT id FROM medications WHERE generic_name = 'ibuprofen' AND strength = '400mg' LIMIT 1),
        'moderate', 3,
        'NSAIDs may reduce the antihypertensive effect of ACE inhibitors and increase risk of kidney problems.',
        'NSAIDs reduce prostaglandin synthesis, affecting kidney function and blood pressure regulation.',
        'Reduced blood pressure control, increased risk of acute kidney injury, hyperkalemia.',
        'Monitor blood pressure and kidney function. Consider alternative pain management.',
        'established', 'delayed'
    ),
    
    -- Metformin + Contrast dye (simulated with ciprofloxacin as proxy)
    (
        (SELECT id FROM medications WHERE generic_name = 'metformin' AND strength = '500mg' LIMIT 1),
        (SELECT id FROM medications WHERE generic_name = 'ciprofloxacin' AND strength = '500mg' LIMIT 1),
        'moderate', 3,
        'Certain medications may increase risk of lactic acidosis when combined with metformin.',
        'Impaired kidney function can lead to metformin accumulation.',
        'Increased risk of lactic acidosis, especially in patients with kidney impairment.',
        'Monitor kidney function. Temporarily discontinue metformin if kidney function is compromised.',
        'established', 'delayed'
    ),
    
    -- Beta blocker + Calcium channel blocker
    (
        (SELECT id FROM medications WHERE generic_name = 'metoprolol' AND strength = '25mg' LIMIT 1),
        (SELECT id FROM medications WHERE generic_name = 'amlodipine' AND strength = '5mg' LIMIT 1),
        'moderate', 3,
        'Additive effects on heart rate and blood pressure when used together.',
        'Both drugs affect cardiovascular function through different mechanisms.',
        'Excessive reduction in heart rate and blood pressure, risk of heart block.',
        'Monitor heart rate and blood pressure closely. Start with lower doses.',
        'established', 'rapid'
    ),
    
    -- SSRI + NSAID
    (
        (SELECT id FROM medications WHERE generic_name = 'sertraline' AND strength = '50mg' LIMIT 1),
        (SELECT id FROM medications WHERE generic_name = 'ibuprofen' AND strength = '400mg' LIMIT 1),
        'moderate', 2,
        'SSRIs combined with NSAIDs may increase risk of bleeding.',
        'SSRIs affect platelet function; NSAIDs affect gastric protection.',
        'Increased risk of gastrointestinal bleeding.',
        'Monitor for signs of bleeding. Consider gastroprotection with PPI.',
        'established', 'delayed'
    ),
    
    -- Benzodiazepine + Opioid (major interaction)
    (
        (SELECT id FROM medications WHERE generic_name = 'lorazepam' AND strength = '0.5mg' LIMIT 1),
        (SELECT id FROM medications WHERE generic_name = 'oxycodone' AND strength = '5mg' LIMIT 1),
        'major', 5,
        'Concurrent use significantly increases risk of respiratory depression, sedation, and death.',
        'Both drugs depress the central nervous system through different mechanisms.',
        'Severe sedation, respiratory depression, coma, death.',
        'Avoid concurrent use when possible. If necessary, use lowest doses and monitor closely.',
        'established', 'rapid'
    ),
    
    -- Statin + Macrolide antibiotic
    (
        (SELECT id FROM medications WHERE generic_name = 'atorvastatin' AND strength = '20mg' LIMIT 1),
        (SELECT id FROM medications WHERE generic_name = 'azithromycin' AND strength = '250mg' LIMIT 1),
        'moderate', 3,
        'Macrolide antibiotics may increase statin levels, increasing risk of muscle toxicity.',
        'Inhibition of CYP3A4 enzyme system reduces statin metabolism.',
        'Increased risk of myopathy, rhabdomyolysis.',
        'Monitor for muscle pain/weakness. Consider temporary statin discontinuation.',
        'established', 'delayed'
    );