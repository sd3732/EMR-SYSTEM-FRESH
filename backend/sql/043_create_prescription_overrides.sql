-- Migration: Create prescription_overrides table for documenting clinical decision support overrides
-- This table tracks when providers override allergy/interaction warnings with clinical justification

CREATE TABLE prescription_overrides (
    id SERIAL PRIMARY KEY,
    
    -- Links to prescription and related entities
    prescription_id INTEGER NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
    patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    medication_id INTEGER NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
    provider_id INTEGER NOT NULL REFERENCES providers(id) ON DELETE SET NULL,
    
    -- Override details
    interaction_ids INTEGER[], -- array of drug_allergy_interaction IDs that were overridden
    override_reason VARCHAR(100) NOT NULL CHECK (override_reason IN (
        'patient_tolerance', 'no_alternatives', 'benefit_outweighs_risk', 
        'mild_reaction_acceptable', 'monitoring_in_place', 'patient_preference',
        'previous_tolerance', 'emergency_situation', 'other'
    )),
    
    -- Clinical documentation
    clinical_justification TEXT NOT NULL, -- detailed reasoning for the override
    monitoring_plan TEXT, -- how the patient will be monitored for adverse reactions
    
    -- Override metadata
    override_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    acknowledged_by_patient BOOLEAN DEFAULT false,
    patient_acknowledgment_date TIMESTAMP,
    
    -- Audit trail
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for efficient queries
CREATE INDEX idx_prescription_overrides_prescription_id ON prescription_overrides(prescription_id);
CREATE INDEX idx_prescription_overrides_patient_id ON prescription_overrides(patient_id);
CREATE INDEX idx_prescription_overrides_medication_id ON prescription_overrides(medication_id);
CREATE INDEX idx_prescription_overrides_provider_id ON prescription_overrides(provider_id);
CREATE INDEX idx_prescription_overrides_override_date ON prescription_overrides(override_date);
CREATE INDEX idx_prescription_overrides_reason ON prescription_overrides(override_reason);

-- Trigger for updated_at
CREATE TRIGGER update_prescription_overrides_updated_at 
    BEFORE UPDATE ON prescription_overrides 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Function to get override statistics for quality reporting
CREATE OR REPLACE FUNCTION get_override_statistics(
    p_start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
    p_end_date DATE DEFAULT CURRENT_DATE,
    p_provider_id INTEGER DEFAULT NULL
) RETURNS TABLE (
    total_overrides BIGINT,
    override_reason VARCHAR(100),
    reason_count BIGINT,
    percentage NUMERIC(5,2)
) AS $$
BEGIN
    RETURN QUERY
    WITH override_counts AS (
        SELECT 
            COUNT(*) as total,
            po.override_reason,
            COUNT(*) as reason_count
        FROM prescription_overrides po
        WHERE po.override_date::date BETWEEN p_start_date AND p_end_date
          AND (p_provider_id IS NULL OR po.provider_id = p_provider_id)
        GROUP BY po.override_reason
    ),
    total_count AS (
        SELECT SUM(reason_count) as overall_total
        FROM override_counts
    )
    SELECT 
        tc.overall_total,
        oc.override_reason,
        oc.reason_count,
        ROUND((oc.reason_count::numeric / tc.overall_total::numeric) * 100, 2) as percentage
    FROM override_counts oc
    CROSS JOIN total_count tc
    ORDER BY oc.reason_count DESC;
END;
$$ LANGUAGE plpgsql;