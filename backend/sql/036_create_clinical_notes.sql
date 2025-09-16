-- Migration: Create clinical notes table for SOAP documentation
-- This table stores structured clinical documentation for each encounter

CREATE TABLE clinical_notes (
    id SERIAL PRIMARY KEY,
    
    -- Link to encounter and patient
    encounter_id INTEGER NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
    patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    provider_id INTEGER REFERENCES providers(id),
    
    -- SOAP Structure
    subjective TEXT, -- Chief complaint, HPI, ROS
    objective TEXT,  -- Physical exam, vitals, test results
    assessment TEXT, -- Clinical impressions, diagnoses
    plan TEXT,       -- Treatment plan, follow-up, patient instructions
    
    -- Clinical metadata
    visit_type VARCHAR(50), -- 'routine', 'follow-up', 'urgent', 'physical', etc.
    template_id INTEGER, -- Reference to templates table (will create next)
    
    -- Status tracking
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'final', 'amended', 'error')),
    finalized_at TIMESTAMP,
    
    -- Revision tracking
    version INTEGER DEFAULT 1,
    parent_note_id INTEGER REFERENCES clinical_notes(id), -- for amendments
    
    -- Audit fields
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id),
    updated_by INTEGER REFERENCES users(id),
    
    -- Ensure only one active note per encounter (unless amended)
    UNIQUE(encounter_id, version)
);

-- Create indexes for efficient queries
CREATE INDEX idx_clinical_notes_encounter ON clinical_notes(encounter_id);
CREATE INDEX idx_clinical_notes_patient ON clinical_notes(patient_id);
CREATE INDEX idx_clinical_notes_provider ON clinical_notes(provider_id);
CREATE INDEX idx_clinical_notes_status ON clinical_notes(status);
CREATE INDEX idx_clinical_notes_created ON clinical_notes(created_at);

-- Full-text search index for clinical content
CREATE INDEX idx_clinical_notes_search ON clinical_notes 
    USING gin(to_tsvector('english', 
        COALESCE(subjective, '') || ' ' || 
        COALESCE(objective, '') || ' ' || 
        COALESCE(assessment, '') || ' ' || 
        COALESCE(plan, '')
    ));

-- Trigger for updated_at
CREATE TRIGGER update_clinical_notes_updated_at 
    BEFORE UPDATE ON clinical_notes 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Function to finalize a clinical note
CREATE OR REPLACE FUNCTION finalize_clinical_note(note_id INTEGER, finalizing_user_id INTEGER) 
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE clinical_notes 
    SET 
        status = 'final',
        finalized_at = CURRENT_TIMESTAMP,
        updated_by = finalizing_user_id,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = note_id AND status = 'draft';
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to create an amended note
CREATE OR REPLACE FUNCTION amend_clinical_note(
    original_note_id INTEGER,
    new_subjective TEXT DEFAULT NULL,
    new_objective TEXT DEFAULT NULL,
    new_assessment TEXT DEFAULT NULL,
    new_plan TEXT DEFAULT NULL,
    amending_user_id INTEGER DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
    original_note clinical_notes%ROWTYPE;
    new_note_id INTEGER;
BEGIN
    -- Get the original note
    SELECT * INTO original_note FROM clinical_notes WHERE id = original_note_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Original note not found';
    END IF;
    
    -- Create amended version
    INSERT INTO clinical_notes (
        encounter_id, patient_id, provider_id,
        subjective, objective, assessment, plan,
        visit_type, template_id,
        status, version, parent_note_id,
        created_by, updated_by
    ) VALUES (
        original_note.encounter_id,
        original_note.patient_id,
        original_note.provider_id,
        COALESCE(new_subjective, original_note.subjective),
        COALESCE(new_objective, original_note.objective),
        COALESCE(new_assessment, original_note.assessment),
        COALESCE(new_plan, original_note.plan),
        original_note.visit_type,
        original_note.template_id,
        'draft',
        original_note.version + 1,
        original_note_id,
        amending_user_id,
        amending_user_id
    ) RETURNING id INTO new_note_id;
    
    -- Mark original as amended
    UPDATE clinical_notes 
    SET status = 'amended', updated_by = amending_user_id, updated_at = CURRENT_TIMESTAMP
    WHERE id = original_note_id;
    
    RETURN new_note_id;
END;
$$ LANGUAGE plpgsql;