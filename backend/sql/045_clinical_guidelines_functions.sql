-- Clinical Guidelines Risk Assessment and Management Functions

-- Function to calculate patient age in years from date of birth
CREATE OR REPLACE FUNCTION calculate_age_years(dob DATE) 
RETURNS INTEGER AS $$
BEGIN
    RETURN EXTRACT(YEAR FROM AGE(CURRENT_DATE, dob));
END;
$$ LANGUAGE plpgsql;

-- Function to calculate patient age in months from date of birth
CREATE OR REPLACE FUNCTION calculate_age_months(dob DATE) 
RETURNS INTEGER AS $$
BEGIN
    RETURN EXTRACT(YEAR FROM AGE(CURRENT_DATE, dob)) * 12 + 
           EXTRACT(MONTH FROM AGE(CURRENT_DATE, dob));
END;
$$ LANGUAGE plpgsql;

-- Function to assess patient risk factors based on medical history
CREATE OR REPLACE FUNCTION assess_patient_risk_factors(
    p_patient_id INTEGER
) RETURNS JSONB AS $$
DECLARE
    risk_factors JSONB := '{}';
    patient_record RECORD;
    allergy_count INTEGER;
    problem_count INTEGER;
    medication_count INTEGER;
BEGIN
    -- Get basic patient information
    SELECT * INTO patient_record FROM patients WHERE id = p_patient_id;
    
    IF NOT FOUND THEN
        RETURN '{"error": "Patient not found"}'::jsonb;
    END IF;
    
    -- Age-based risk factors
    IF calculate_age_years(patient_record.dob) >= 65 THEN
        risk_factors := risk_factors || '{"elderly": true}';
    END IF;
    
    IF calculate_age_years(patient_record.dob) >= 50 THEN
        risk_factors := risk_factors || '{"middle_aged": true}';
    END IF;
    
    -- Count active problems for comorbidity assessment
    SELECT COUNT(*) INTO problem_count 
    FROM problems 
    WHERE patient_id = p_patient_id AND status = 'active';
    
    IF problem_count >= 3 THEN
        risk_factors := risk_factors || '{"multiple_comorbidities": true}';
    END IF;
    
    -- Check for diabetes
    IF EXISTS (
        SELECT 1 FROM problems 
        WHERE patient_id = p_patient_id 
          AND status = 'active'
          AND (LOWER(description) LIKE '%diabetes%' OR code LIKE 'E11%' OR code LIKE 'E10%')
    ) THEN
        risk_factors := risk_factors || '{"diabetes": true}';
    END IF;
    
    -- Check for hypertension
    IF EXISTS (
        SELECT 1 FROM problems 
        WHERE patient_id = p_patient_id 
          AND status = 'active'
          AND (LOWER(description) LIKE '%hypertension%' OR code LIKE 'I10%' OR code LIKE 'I15%')
    ) THEN
        risk_factors := risk_factors || '{"hypertension": true}';
    END IF;
    
    -- Check for smoking history (would need to be tracked in social history)
    -- For now, we'll check if smoking cessation medications are prescribed
    IF EXISTS (
        SELECT 1 FROM prescriptions p
        JOIN medications m ON p.medication_id = m.id
        WHERE p.patient_id = p_patient_id 
          AND p.status = 'active'
          AND (LOWER(m.generic_name) LIKE '%nicotine%' 
               OR LOWER(m.generic_name) LIKE '%bupropion%'
               OR LOWER(m.generic_name) LIKE '%varenicline%')
    ) THEN
        risk_factors := risk_factors || '{"smoking_history": true}';
    END IF;
    
    -- Check for family history indicators (would need separate family history table)
    -- For now, we'll infer from certain screening patterns or early screening orders
    
    -- Check for immunocompromised status based on medications
    IF EXISTS (
        SELECT 1 FROM prescriptions p
        JOIN medications m ON p.medication_id = m.id
        WHERE p.patient_id = p_patient_id 
          AND p.status = 'active'
          AND (LOWER(m.drug_class) LIKE '%immunosuppressant%' 
               OR LOWER(m.generic_name) LIKE '%methotrexate%'
               OR LOWER(m.generic_name) LIKE '%prednisone%')
    ) THEN
        risk_factors := risk_factors || '{"immunocompromised": true}';
    END IF;
    
    -- Add basic demographics
    risk_factors := risk_factors || jsonb_build_object('age_years', calculate_age_years(patient_record.dob));
    risk_factors := risk_factors || jsonb_build_object('gender', COALESCE(patient_record.gender, 'unknown'));
    
    RETURN risk_factors;
END;
$$ LANGUAGE plpgsql;

-- Function to get applicable clinical guidelines for a patient
CREATE OR REPLACE FUNCTION get_applicable_guidelines(
    p_patient_id INTEGER
) RETURNS TABLE (
    guideline_id INTEGER,
    guideline_code VARCHAR(50),
    name VARCHAR(255),
    category VARCHAR(100),
    priority_level INTEGER,
    due_date DATE,
    risk_level VARCHAR(20),
    status VARCHAR(20)
) AS $$
DECLARE
    patient_record RECORD;
    patient_age INTEGER;
    patient_risk_factors JSONB;
BEGIN
    -- Get patient information
    SELECT * INTO patient_record FROM patients WHERE id = p_patient_id;
    
    IF NOT FOUND THEN
        RETURN;
    END IF;
    
    patient_age := calculate_age_years(patient_record.dob);
    patient_risk_factors := assess_patient_risk_factors(p_patient_id);
    
    -- Return applicable guidelines
    RETURN QUERY
    SELECT 
        cg.id as guideline_id,
        cg.guideline_code,
        cg.name,
        cg.category,
        cg.priority_level,
        CASE 
            WHEN pgs.due_date IS NOT NULL THEN pgs.due_date
            ELSE CURRENT_DATE -- If no existing status, assume due now
        END as due_date,
        COALESCE(pgs.risk_level, 'average') as risk_level,
        COALESCE(pgs.status, 'due') as status
    FROM clinical_guidelines cg
    LEFT JOIN patient_guideline_status pgs ON (cg.id = pgs.guideline_id AND pgs.patient_id = p_patient_id)
    WHERE cg.active = true
      AND (cg.min_age IS NULL OR patient_age >= cg.min_age)
      AND (cg.max_age IS NULL OR patient_age <= cg.max_age)
      AND (cg.gender = 'any' OR cg.gender = patient_record.gender OR patient_record.gender IS NULL)
      AND (pgs.status IS NULL OR pgs.status IN ('due', 'overdue'))
    ORDER BY cg.priority_level ASC, due_date ASC;
END;
$$ LANGUAGE plpgsql;

-- Function to update patient guideline statuses
CREATE OR REPLACE FUNCTION update_patient_guideline_status(
    p_patient_id INTEGER,
    p_guideline_id INTEGER,
    p_status VARCHAR(20),
    p_completed_date DATE DEFAULT NULL,
    p_provider_id INTEGER DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
    guideline_record RECORD;
    next_due DATE;
BEGIN
    -- Get guideline information
    SELECT * INTO guideline_record FROM clinical_guidelines WHERE id = p_guideline_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Guideline not found';
    END IF;
    
    -- Calculate next due date if completed
    IF p_status = 'completed' AND p_completed_date IS NOT NULL THEN
        next_due := p_completed_date + (guideline_record.interval_months || ' months')::interval;
    END IF;
    
    -- Insert or update patient guideline status
    INSERT INTO patient_guideline_status (
        patient_id, guideline_id, status, due_date, last_completed_date,
        next_due_date, completed_date, completed_provider_id, completion_notes
    ) VALUES (
        p_patient_id, p_guideline_id, p_status, COALESCE(next_due, CURRENT_DATE),
        p_completed_date, next_due, p_completed_date, p_provider_id, p_notes
    )
    ON CONFLICT (patient_id, guideline_id) 
    DO UPDATE SET
        status = EXCLUDED.status,
        last_completed_date = EXCLUDED.last_completed_date,
        next_due_date = EXCLUDED.next_due_date,
        completed_date = EXCLUDED.completed_date,
        completed_provider_id = EXCLUDED.completed_provider_id,
        completion_notes = EXCLUDED.completion_notes,
        updated_at = CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- Function to get overdue screenings for a patient
CREATE OR REPLACE FUNCTION get_overdue_screenings(
    p_patient_id INTEGER
) RETURNS TABLE (
    guideline_id INTEGER,
    guideline_code VARCHAR(50),
    name VARCHAR(255),
    category VARCHAR(100),
    priority_level INTEGER,
    due_date DATE,
    days_overdue INTEGER,
    urgency_level VARCHAR(10)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ag.guideline_id,
        ag.guideline_code,
        ag.name,
        ag.category,
        ag.priority_level,
        ag.due_date,
        (CURRENT_DATE - ag.due_date) as days_overdue,
        CASE 
            WHEN (CURRENT_DATE - ag.due_date) >= 90 THEN 'red'
            WHEN (CURRENT_DATE - ag.due_date) >= 30 THEN 'yellow'
            ELSE 'green'
        END as urgency_level
    FROM get_applicable_guidelines(p_patient_id) ag
    WHERE ag.due_date < CURRENT_DATE
      AND ag.status IN ('due', 'overdue')
    ORDER BY ag.priority_level ASC, days_overdue DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get vaccination schedule for a patient
CREATE OR REPLACE FUNCTION get_patient_vaccination_schedule(
    p_patient_id INTEGER
) RETURNS TABLE (
    vaccine_name VARCHAR(255),
    dose_number INTEGER,
    total_doses INTEGER,
    due_date DATE,
    overdue_date DATE,
    status VARCHAR(20)
) AS $$
DECLARE
    patient_record RECORD;
    patient_age_months INTEGER;
BEGIN
    -- Get patient information
    SELECT * INTO patient_record FROM patients WHERE id = p_patient_id;
    
    IF NOT FOUND THEN
        RETURN;
    END IF;
    
    patient_age_months := calculate_age_months(patient_record.dob);
    
    -- Get applicable vaccinations based on age
    RETURN QUERY
    SELECT 
        vs.vaccine_name,
        vs.dose_number,
        vs.total_doses,
        CASE 
            WHEN vs.min_age_months IS NOT NULL THEN 
                patient_record.dob + (vs.min_age_months || ' months')::interval
            ELSE CURRENT_DATE
        END::DATE as due_date,
        CASE 
            WHEN vs.min_age_months IS NOT NULL THEN 
                patient_record.dob + (vs.min_age_months + 4 || ' months')::interval  -- 4 weeks grace period
            ELSE CURRENT_DATE + INTERVAL '4 weeks'
        END::DATE as overdue_date,
        CASE 
            WHEN EXISTS (
                SELECT 1 FROM patient_vaccinations pv 
                WHERE pv.patient_id = p_patient_id 
                  AND pv.vaccine_name = vs.vaccine_name 
                  AND pv.dose_number = vs.dose_number
            ) THEN 'completed'
            WHEN vs.min_age_months IS NULL OR patient_age_months >= vs.min_age_months THEN 'due'
            ELSE 'future'
        END as status
    FROM vaccination_schedules vs
    WHERE vs.active = true
      AND (vs.min_age_months IS NULL OR patient_age_months >= vs.min_age_months - 4) -- Include upcoming vaccines
      AND (vs.max_age_months IS NULL OR patient_age_months <= vs.max_age_months)
    ORDER BY vs.vaccine_name, vs.dose_number;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate patient's overall preventive care score
CREATE OR REPLACE FUNCTION calculate_preventive_care_score(
    p_patient_id INTEGER
) RETURNS TABLE (
    total_guidelines INTEGER,
    completed_count INTEGER,
    overdue_count INTEGER,
    score_percentage INTEGER,
    score_grade VARCHAR(2)
) AS $$
DECLARE
    total_count INTEGER;
    completed_count INTEGER;
    overdue_count INTEGER;
    score_pct INTEGER;
    grade VARCHAR(2);
BEGIN
    -- Count total applicable guidelines
    SELECT COUNT(*) INTO total_count
    FROM get_applicable_guidelines(p_patient_id);
    
    -- Count completed guidelines (those with recent completion)
    SELECT COUNT(*) INTO completed_count
    FROM get_applicable_guidelines(p_patient_id) ag
    WHERE ag.status = 'completed' 
       OR EXISTS (
           SELECT 1 FROM patient_guideline_status pgs
           WHERE pgs.patient_id = p_patient_id
             AND pgs.guideline_id = ag.guideline_id
             AND pgs.last_completed_date >= CURRENT_DATE - INTERVAL '2 years'
       );
    
    -- Count overdue guidelines
    SELECT COUNT(*) INTO overdue_count
    FROM get_overdue_screenings(p_patient_id);
    
    -- Calculate score percentage
    IF total_count > 0 THEN
        score_pct := (completed_count * 100) / total_count;
    ELSE
        score_pct := 100;
    END IF;
    
    -- Assign grade
    grade := CASE 
        WHEN score_pct >= 90 THEN 'A+'
        WHEN score_pct >= 85 THEN 'A'
        WHEN score_pct >= 80 THEN 'B+'
        WHEN score_pct >= 75 THEN 'B'
        WHEN score_pct >= 70 THEN 'C+'
        WHEN score_pct >= 65 THEN 'C'
        WHEN score_pct >= 60 THEN 'D'
        ELSE 'F'
    END;
    
    RETURN QUERY SELECT total_count, completed_count, overdue_count, score_pct, grade;
END;
$$ LANGUAGE plpgsql;

-- Procedure to run daily maintenance on guideline statuses
CREATE OR REPLACE FUNCTION maintain_guideline_statuses() 
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER := 0;
    patient_rec RECORD;
BEGIN
    -- Update overdue statuses
    FOR patient_rec IN 
        SELECT DISTINCT patient_id FROM patient_guideline_status 
        WHERE status = 'due' AND due_date < CURRENT_DATE
    LOOP
        UPDATE patient_guideline_status 
        SET status = 'overdue', updated_at = CURRENT_TIMESTAMP
        WHERE patient_id = patient_rec.patient_id 
          AND status = 'due' 
          AND due_date < CURRENT_DATE;
        
        GET DIAGNOSTICS updated_count = updated_count + ROW_COUNT;
    END LOOP;
    
    -- Initialize guideline statuses for patients who don't have them yet
    INSERT INTO patient_guideline_status (patient_id, guideline_id, status, due_date, risk_level)
    SELECT 
        p.id as patient_id,
        cg.id as guideline_id,
        'due' as status,
        CURRENT_DATE as due_date,
        'average' as risk_level
    FROM patients p
    CROSS JOIN clinical_guidelines cg
    WHERE cg.active = true
      AND NOT EXISTS (
          SELECT 1 FROM patient_guideline_status pgs
          WHERE pgs.patient_id = p.id AND pgs.guideline_id = cg.id
      )
      AND (cg.min_age IS NULL OR calculate_age_years(p.dob) >= cg.min_age)
      AND (cg.max_age IS NULL OR calculate_age_years(p.dob) <= cg.max_age)
      AND (cg.gender = 'any' OR cg.gender = p.gender OR p.gender IS NULL);
    
    GET DIAGNOSTICS updated_count = updated_count + ROW_COUNT;
    
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql;