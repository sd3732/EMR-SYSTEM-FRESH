-- Enhanced Family History Schema for Tree Visualization
-- Improve family history to support proper hierarchical tree structure

-- Drop existing family_history table to recreate with better structure
DROP TABLE IF EXISTS family_history CASCADE;

-- Create enhanced family members table with proper relationships
CREATE TABLE IF NOT EXISTS family_members (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES patients(id),
    
    -- Family member identification
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    maiden_name VARCHAR(100), -- For tracking maternal lineage
    gender VARCHAR(10), -- 'male', 'female', 'other', 'unknown'
    date_of_birth DATE,
    date_of_death DATE,
    is_deceased BOOLEAN DEFAULT false,
    
    -- Relationship hierarchy
    relationship_to_patient VARCHAR(50) NOT NULL, -- 'mother', 'father', 'maternal_grandfather', etc.
    generation_level INTEGER NOT NULL, -- 0=patient, 1=parents/siblings, 2=grandparents/aunts/uncles, 3=great-grandparents
    parent_id INTEGER REFERENCES family_members(id), -- Self-referencing for tree structure
    spouse_id INTEGER REFERENCES family_members(id), -- Link to spouse
    
    -- Contact and demographic info
    is_living BOOLEAN DEFAULT true,
    contact_information JSONB, -- phone, email, address if available
    ethnicity VARCHAR(100),
    
    -- Medical relevance
    medical_history_available BOOLEAN DEFAULT false,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Family medical conditions with enhanced tracking
CREATE TABLE IF NOT EXISTS family_medical_conditions (
    id SERIAL PRIMARY KEY,
    family_member_id INTEGER NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
    patient_id INTEGER NOT NULL REFERENCES patients(id), -- For easy querying by patient
    
    -- Condition details
    condition_name VARCHAR(200) NOT NULL,
    icd10_code VARCHAR(20),
    condition_category VARCHAR(50), -- 'cancer', 'cardiovascular', 'genetic', 'mental_health', etc.
    severity VARCHAR(20), -- 'mild', 'moderate', 'severe', 'fatal'
    
    -- Timing and status
    age_at_onset INTEGER,
    age_at_diagnosis INTEGER,
    age_at_death INTEGER, -- If condition was cause of death
    is_cause_of_death BOOLEAN DEFAULT false,
    current_status VARCHAR(20) DEFAULT 'unknown', -- 'active', 'resolved', 'managed', 'unknown'
    
    -- Clinical relevance
    genetic_relevance VARCHAR(20) DEFAULT 'unknown', -- 'high', 'moderate', 'low', 'unknown'
    screening_implications JSONB, -- Recommended screenings based on this family history
    risk_contribution DECIMAL(3,2) DEFAULT 0, -- 0-1 scale for risk calculation
    
    -- Documentation
    notes TEXT,
    source_reliability VARCHAR(20) DEFAULT 'patient_report', -- 'patient_report', 'medical_records', 'death_certificate'
    last_verified DATE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Family health patterns and risk analysis
CREATE TABLE IF NOT EXISTS family_health_patterns (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES patients(id),
    
    -- Pattern analysis
    condition_category VARCHAR(50) NOT NULL,
    pattern_strength VARCHAR(20), -- 'strong', 'moderate', 'weak'
    affected_members_count INTEGER DEFAULT 0,
    total_relevant_members INTEGER DEFAULT 0, -- Members where this condition could be assessed
    
    -- Risk assessment
    calculated_risk_level VARCHAR(20), -- 'high', 'moderate', 'low'
    risk_score DECIMAL(5,2), -- Numerical risk score
    recommended_screenings JSONB, -- Array of screening recommendations
    screening_age_adjustments JSONB, -- Earlier screening recommendations
    
    -- Genetic counseling
    genetic_counseling_recommended BOOLEAN DEFAULT false,
    genetic_testing_criteria_met BOOLEAN DEFAULT false,
    counseling_notes TEXT,
    
    last_calculated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Family tree visualization metadata
CREATE TABLE IF NOT EXISTS family_tree_layout (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES patients(id),
    family_member_id INTEGER NOT NULL REFERENCES family_members(id),
    
    -- Tree positioning
    tree_level INTEGER NOT NULL, -- Generation level in tree (0=patient, negative=descendants, positive=ancestors)
    horizontal_position DECIMAL(5,2), -- X coordinate for tree layout
    branch_side VARCHAR(10), -- 'maternal', 'paternal', 'patient'
    
    -- Display preferences
    is_visible BOOLEAN DEFAULT true,
    is_expanded BOOLEAN DEFAULT true,
    display_priority INTEGER DEFAULT 1, -- Higher priority members shown first
    
    -- Connection lines
    connects_to INTEGER[], -- Array of family_member_ids this person connects to
    connection_type VARCHAR(20), -- 'parent', 'child', 'spouse', 'sibling'
    
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Enhanced views for family history analysis
CREATE OR REPLACE VIEW family_history_summary AS
SELECT 
    p.id as patient_id,
    p.first_name || ' ' || p.last_name as patient_name,
    COUNT(DISTINCT fm.id) as total_family_members,
    COUNT(DISTINCT CASE WHEN fm.medical_history_available = true THEN fm.id END) as members_with_medical_history,
    COUNT(DISTINCT fmc.condition_name) as unique_conditions,
    COUNT(fmc.id) as total_conditions,
    array_agg(DISTINCT fmc.condition_category) FILTER (WHERE fmc.condition_category IS NOT NULL) as condition_categories,
    MAX(fmc.created_at) as last_updated
FROM patients p
LEFT JOIN family_members fm ON p.id = fm.patient_id
LEFT JOIN family_medical_conditions fmc ON fm.id = fmc.family_member_id
WHERE p.status = 'active'
GROUP BY p.id, p.first_name, p.last_name;

CREATE OR REPLACE VIEW family_risk_assessment AS
SELECT 
    p.id as patient_id,
    fmc.condition_category,
    COUNT(DISTINCT fmc.family_member_id) as affected_family_members,
    array_agg(DISTINCT fm.relationship_to_patient) as relationships_affected,
    AVG(fmc.risk_contribution) as average_risk_contribution,
    CASE 
        WHEN COUNT(DISTINCT fmc.family_member_id) >= 3 THEN 'strong_pattern'
        WHEN COUNT(DISTINCT fmc.family_member_id) = 2 THEN 'moderate_pattern'
        WHEN COUNT(DISTINCT fmc.family_member_id) = 1 THEN 'single_occurrence'
        ELSE 'none'
    END as pattern_strength,
    -- Risk level based on number of affected relatives and their relationships
    CASE 
        WHEN COUNT(DISTINCT CASE WHEN fm.generation_level = 1 THEN fmc.family_member_id END) >= 1 
             AND COUNT(DISTINCT fmc.family_member_id) >= 2 THEN 'high'
        WHEN COUNT(DISTINCT CASE WHEN fm.generation_level <= 2 THEN fmc.family_member_id END) >= 2 THEN 'moderate'
        WHEN COUNT(DISTINCT fmc.family_member_id) >= 1 THEN 'low'
        ELSE 'none'
    END as risk_level
FROM patients p
LEFT JOIN family_members fm ON p.id = fm.patient_id
LEFT JOIN family_medical_conditions fmc ON fm.id = fmc.family_member_id
WHERE p.status = 'active' AND fmc.id IS NOT NULL
GROUP BY p.id, fmc.condition_category;

-- Function to calculate family tree positions
CREATE OR REPLACE FUNCTION calculate_family_tree_positions(p_patient_id INTEGER)
RETURNS void AS $$
DECLARE
    member_record RECORD;
    position_counter DECIMAL := 0;
    level_counters JSONB := '{}';
BEGIN
    -- Clear existing layout data for this patient
    DELETE FROM family_tree_layout WHERE patient_id = p_patient_id;
    
    -- Position patient at center (level 0, position 0)
    INSERT INTO family_tree_layout (patient_id, family_member_id, tree_level, horizontal_position, branch_side, display_priority)
    SELECT p_patient_id, id, 0, 0, 'patient', 10
    FROM family_members 
    WHERE patient_id = p_patient_id AND relationship_to_patient = 'self';
    
    -- Position parents (level 1)
    FOR member_record IN 
        SELECT * FROM family_members 
        WHERE patient_id = p_patient_id 
          AND relationship_to_patient IN ('mother', 'father')
        ORDER BY CASE WHEN relationship_to_patient = 'father' THEN 1 ELSE 2 END
    LOOP
        INSERT INTO family_tree_layout (patient_id, family_member_id, tree_level, horizontal_position, branch_side, display_priority)
        VALUES (
            p_patient_id,
            member_record.id,
            1,
            CASE WHEN member_record.relationship_to_patient = 'father' THEN -1.0 ELSE 1.0 END,
            CASE WHEN member_record.relationship_to_patient = 'father' THEN 'paternal' ELSE 'maternal' END,
            9
        );
    END LOOP;
    
    -- Position grandparents (level 2)
    position_counter := -3;
    FOR member_record IN 
        SELECT * FROM family_members 
        WHERE patient_id = p_patient_id 
          AND relationship_to_patient IN ('paternal_grandfather', 'paternal_grandmother', 'maternal_grandfather', 'maternal_grandmother')
        ORDER BY relationship_to_patient
    LOOP
        INSERT INTO family_tree_layout (patient_id, family_member_id, tree_level, horizontal_position, branch_side, display_priority)
        VALUES (
            p_patient_id,
            member_record.id,
            2,
            position_counter,
            CASE WHEN member_record.relationship_to_patient LIKE 'paternal%' THEN 'paternal' ELSE 'maternal' END,
            8
        );
        position_counter := position_counter + 2;
    END LOOP;
    
    -- Position siblings at same level as patient but offset
    position_counter := -2;
    FOR member_record IN 
        SELECT * FROM family_members 
        WHERE patient_id = p_patient_id 
          AND relationship_to_patient IN ('brother', 'sister')
        ORDER BY date_of_birth NULLS LAST
    LOOP
        -- Skip position 0 (patient's position)
        IF position_counter = 0 THEN
            position_counter := position_counter + 1;
        END IF;
        
        INSERT INTO family_tree_layout (patient_id, family_member_id, tree_level, horizontal_position, branch_side, display_priority)
        VALUES (
            p_patient_id,
            member_record.id,
            0,
            position_counter,
            'patient',
            7
        );
        position_counter := position_counter + 1;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to get family tree data for visualization
CREATE OR REPLACE FUNCTION get_family_tree_data(p_patient_id INTEGER)
RETURNS JSONB AS $$
DECLARE
    tree_data JSONB;
    member_data JSONB;
BEGIN
    -- Get family tree structure with member details and conditions
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', fm.id,
            'name', COALESCE(fm.first_name || ' ' || fm.last_name, 'Unknown'),
            'relationship', fm.relationship_to_patient,
            'generation', fm.generation_level,
            'position', COALESCE(ftl.horizontal_position, 0),
            'branch', COALESCE(ftl.branch_side, 'patient'),
            'isDeceased', fm.is_deceased,
            'age', CASE 
                WHEN fm.is_deceased AND fm.date_of_death IS NOT NULL AND fm.date_of_birth IS NOT NULL 
                THEN EXTRACT(YEAR FROM AGE(fm.date_of_death, fm.date_of_birth))
                WHEN NOT fm.is_deceased AND fm.date_of_birth IS NOT NULL 
                THEN EXTRACT(YEAR FROM AGE(fm.date_of_birth))
                ELSE NULL
            END,
            'medicalConditions', COALESCE(conditions.condition_list, '[]'::jsonb),
            'hasConditions', COALESCE(conditions.condition_count, 0) > 0,
            'riskLevel', CASE 
                WHEN COALESCE(conditions.max_risk, 0) >= 0.7 THEN 'high'
                WHEN COALESCE(conditions.max_risk, 0) >= 0.4 THEN 'moderate'
                WHEN COALESCE(conditions.max_risk, 0) > 0 THEN 'low'
                ELSE 'none'
            END
        )
    ) INTO tree_data
    FROM family_members fm
    LEFT JOIN family_tree_layout ftl ON fm.id = ftl.family_member_id
    LEFT JOIN (
        SELECT 
            family_member_id,
            jsonb_agg(jsonb_build_object(
                'name', condition_name,
                'category', condition_category,
                'severity', severity,
                'ageAtOnset', age_at_onset,
                'riskContribution', risk_contribution
            )) as condition_list,
            COUNT(*) as condition_count,
            MAX(risk_contribution) as max_risk
        FROM family_medical_conditions
        GROUP BY family_member_id
    ) conditions ON fm.id = conditions.family_member_id
    WHERE fm.patient_id = p_patient_id;
    
    RETURN COALESCE(tree_data, '[]'::jsonb);
END;
$$ LANGUAGE plpgsql;

-- Insert some sample family data relationships
INSERT INTO family_members (patient_id, first_name, last_name, relationship_to_patient, generation_level, gender, is_living) VALUES
-- This will be populated dynamically based on patient intake forms
(1, 'John', 'Doe', 'self', 0, 'male', true) ON CONFLICT DO NOTHING;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_family_members_patient ON family_members(patient_id);
CREATE INDEX IF NOT EXISTS idx_family_members_relationship ON family_members(relationship_to_patient);
CREATE INDEX IF NOT EXISTS idx_family_members_generation ON family_members(generation_level);
CREATE INDEX IF NOT EXISTS idx_family_medical_conditions_member ON family_medical_conditions(family_member_id);
CREATE INDEX IF NOT EXISTS idx_family_medical_conditions_patient ON family_medical_conditions(patient_id);
CREATE INDEX IF NOT EXISTS idx_family_medical_conditions_category ON family_medical_conditions(condition_category);
CREATE INDEX IF NOT EXISTS idx_family_tree_layout_patient ON family_tree_layout(patient_id);
CREATE INDEX IF NOT EXISTS idx_family_health_patterns_patient ON family_health_patterns(patient_id);

-- Comments for documentation
COMMENT ON TABLE family_members IS 'Enhanced family member tracking with proper hierarchical relationships for tree visualization';
COMMENT ON TABLE family_medical_conditions IS 'Detailed family medical history with risk assessment and genetic implications';
COMMENT ON TABLE family_health_patterns IS 'Analysis of family health patterns for risk stratification and screening recommendations';
COMMENT ON TABLE family_tree_layout IS 'Positioning and layout metadata for family tree visualization';