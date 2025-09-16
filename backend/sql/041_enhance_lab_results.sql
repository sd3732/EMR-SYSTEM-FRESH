-- 041_enhance_lab_results.sql
-- Enhance existing results table for comprehensive lab results workflow

BEGIN;

-- Add additional columns to results table for enhanced lab workflow
ALTER TABLE results ADD COLUMN IF NOT EXISTS lab_order_id INTEGER REFERENCES lab_orders(id) ON DELETE SET NULL;
ALTER TABLE results ADD COLUMN IF NOT EXISTS component_code VARCHAR(20);
ALTER TABLE results ADD COLUMN IF NOT EXISTS reference_range VARCHAR(100);
ALTER TABLE results ADD COLUMN IF NOT EXISTS abnormal_flag VARCHAR(10) CHECK (abnormal_flag IN ('L', 'H', 'LL', 'HH', 'A', 'AA', 'N', NULL));
ALTER TABLE results ADD COLUMN IF NOT EXISTS critical_flag BOOLEAN DEFAULT false;
ALTER TABLE results ADD COLUMN IF NOT EXISTS delta_flag BOOLEAN DEFAULT false; -- significant change from previous
ALTER TABLE results ADD COLUMN IF NOT EXISTS result_status VARCHAR(20) DEFAULT 'final' CHECK (result_status IN ('preliminary', 'final', 'amended', 'cancelled'));
ALTER TABLE results ADD COLUMN IF NOT EXISTS performing_lab VARCHAR(100);
ALTER TABLE results ADD COLUMN IF NOT EXISTS method VARCHAR(100);
ALTER TABLE results ADD COLUMN IF NOT EXISTS specimen_id VARCHAR(100);
ALTER TABLE results ADD COLUMN IF NOT EXISTS received_at TIMESTAMP;
ALTER TABLE results ADD COLUMN IF NOT EXISTS resulted_at TIMESTAMP;
ALTER TABLE results ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP;
ALTER TABLE results ADD COLUMN IF NOT EXISTS verified_by VARCHAR(100);

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_results_lab_order ON results(lab_order_id);
CREATE INDEX IF NOT EXISTS idx_results_component ON results(component_code);
CREATE INDEX IF NOT EXISTS idx_results_abnormal ON results(abnormal_flag) WHERE abnormal_flag IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_results_critical ON results(critical_flag) WHERE critical_flag = true;
CREATE INDEX IF NOT EXISTS idx_results_status ON results(result_status);
CREATE INDEX IF NOT EXISTS idx_results_specimen ON results(specimen_id) WHERE specimen_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_results_patient_observed ON results(patient_id, observed_at DESC);

-- Create table for result notifications and alerts
CREATE TABLE IF NOT EXISTS result_notifications (
    id SERIAL PRIMARY KEY,
    result_id INTEGER NOT NULL REFERENCES results(id) ON DELETE CASCADE,
    notification_type VARCHAR(20) NOT NULL CHECK (notification_type IN ('critical', 'abnormal', 'delta', 'new')),
    priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'critical')),
    recipient_provider_id INTEGER REFERENCES providers(id),
    message TEXT,
    sent_at TIMESTAMP,
    acknowledged_at TIMESTAMP,
    acknowledged_by INTEGER REFERENCES providers(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_result_notifications_result ON result_notifications(result_id);
CREATE INDEX idx_result_notifications_provider ON result_notifications(recipient_provider_id);
CREATE INDEX idx_result_notifications_type ON result_notifications(notification_type);
CREATE INDEX idx_result_notifications_unack ON result_notifications(acknowledged_at) WHERE acknowledged_at IS NULL;

-- Create table for result trending and historical comparison
CREATE TABLE IF NOT EXISTS result_trends (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    component_code VARCHAR(20) NOT NULL,
    result_date DATE NOT NULL,
    result_value DECIMAL(15,6),
    result_text VARCHAR(255),
    reference_range VARCHAR(100),
    abnormal_flag VARCHAR(10),
    trend_direction VARCHAR(10) CHECK (trend_direction IN ('up', 'down', 'stable', 'new')),
    percent_change DECIMAL(8,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_result_trends_patient_component ON result_trends(patient_id, component_code);
CREATE INDEX idx_result_trends_date ON result_trends(result_date DESC);
CREATE UNIQUE INDEX idx_result_trends_unique ON result_trends(patient_id, component_code, result_date);

-- Function to automatically flag critical and abnormal results
CREATE OR REPLACE FUNCTION flag_result_abnormalities()
RETURNS TRIGGER AS $$
DECLARE
    comp_rec RECORD;
    numeric_value DECIMAL;
    ref_low DECIMAL;
    ref_high DECIMAL;
    crit_low DECIMAL;
    crit_high DECIMAL;
BEGIN
    -- Only process if we have a component code and numeric value
    IF NEW.component_code IS NOT NULL AND NEW.value ~ '^[0-9]+\.?[0-9]*$' THEN
        -- Get component reference ranges
        SELECT 
            ltc.reference_range_male,
            ltc.reference_range_female,
            ltc.critical_low,
            ltc.critical_high
        INTO comp_rec
        FROM lab_test_components ltc
        WHERE ltc.component_code = NEW.component_code
        LIMIT 1;
        
        IF FOUND THEN
            numeric_value := NEW.value::DECIMAL;
            crit_low := comp_rec.critical_low;
            crit_high := comp_rec.critical_high;
            
            -- Use male reference range as default (could be enhanced with patient sex)
            IF comp_rec.reference_range_male ~ '^[0-9\.]+\-[0-9\.]+$' THEN
                ref_low := split_part(comp_rec.reference_range_male, '-', 1)::DECIMAL;
                ref_high := split_part(comp_rec.reference_range_male, '-', 2)::DECIMAL;
                
                -- Set abnormal flags
                IF numeric_value < ref_low THEN
                    NEW.abnormal_flag := 'L';
                ELSIF numeric_value > ref_high THEN
                    NEW.abnormal_flag := 'H';
                ELSE
                    NEW.abnormal_flag := 'N';
                END IF;
                
                -- Set critical flags
                IF (crit_low IS NOT NULL AND numeric_value <= crit_low) OR 
                   (crit_high IS NOT NULL AND numeric_value >= crit_high) THEN
                    NEW.critical_flag := true;
                    NEW.abnormal_flag := CASE 
                        WHEN numeric_value <= crit_low THEN 'LL'
                        WHEN numeric_value >= crit_high THEN 'HH'
                        ELSE NEW.abnormal_flag
                    END;
                END IF;
            END IF;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic flagging
DROP TRIGGER IF EXISTS results_flag_abnormalities ON results;
CREATE TRIGGER results_flag_abnormalities
    BEFORE INSERT OR UPDATE ON results
    FOR EACH ROW EXECUTE FUNCTION flag_result_abnormalities();

-- Function to create result notifications for critical/abnormal values
CREATE OR REPLACE FUNCTION create_result_notifications()
RETURNS TRIGGER AS $$
BEGIN
    -- Create critical value notification
    IF NEW.critical_flag = true THEN
        INSERT INTO result_notifications (result_id, notification_type, priority, message)
        VALUES (NEW.id, 'critical', 'critical', 
                'Critical value: ' || NEW.name || ' = ' || NEW.value || ' ' || COALESCE(NEW.units, ''));
    -- Create abnormal value notification for significant abnormalities
    ELSIF NEW.abnormal_flag IN ('L', 'H', 'LL', 'HH') THEN
        INSERT INTO result_notifications (result_id, notification_type, priority, message)
        VALUES (NEW.id, 'abnormal', 'normal', 
                'Abnormal value: ' || NEW.name || ' = ' || NEW.value || ' ' || COALESCE(NEW.units, '') ||
                ' (Reference: ' || COALESCE(NEW.reference_range, 'N/A') || ')');
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for notification creation
DROP TRIGGER IF EXISTS results_create_notifications ON results;
CREATE TRIGGER results_create_notifications
    AFTER INSERT OR UPDATE ON results
    FOR EACH ROW EXECUTE FUNCTION create_result_notifications();

-- Function to update result trends
CREATE OR REPLACE FUNCTION update_result_trends()
RETURNS TRIGGER AS $$
DECLARE
    prev_result RECORD;
    trend_dir VARCHAR(10);
    pct_change DECIMAL(8,2);
BEGIN
    -- Only process if we have component code and observed date
    IF NEW.component_code IS NOT NULL AND NEW.observed_at IS NOT NULL THEN
        -- Get most recent previous result for this patient and component
        SELECT value::DECIMAL as prev_value
        INTO prev_result
        FROM results 
        WHERE patient_id = NEW.patient_id 
            AND component_code = NEW.component_code 
            AND observed_at < NEW.observed_at
            AND value ~ '^[0-9]+\.?[0-9]*$'
        ORDER BY observed_at DESC 
        LIMIT 1;
        
        -- Calculate trend
        IF FOUND AND NEW.value ~ '^[0-9]+\.?[0-9]*$' THEN
            IF prev_result.prev_value > 0 THEN
                pct_change := ((NEW.value::DECIMAL - prev_result.prev_value) / prev_result.prev_value) * 100;
            END IF;
            
            -- Determine trend direction (>10% change threshold)
            IF pct_change > 10 THEN
                trend_dir := 'up';
            ELSIF pct_change < -10 THEN
                trend_dir := 'down';
            ELSE
                trend_dir := 'stable';
            END IF;
        ELSE
            trend_dir := 'new';
        END IF;
        
        -- Insert or update trend record
        INSERT INTO result_trends (
            patient_id, component_code, result_date, result_value, result_text,
            reference_range, abnormal_flag, trend_direction, percent_change
        ) VALUES (
            NEW.patient_id, NEW.component_code, NEW.observed_at::DATE,
            CASE WHEN NEW.value ~ '^[0-9]+\.?[0-9]*$' THEN NEW.value::DECIMAL ELSE NULL END,
            NEW.value, NEW.reference_range, NEW.abnormal_flag, trend_dir, pct_change
        )
        ON CONFLICT (patient_id, component_code, result_date)
        DO UPDATE SET
            result_value = EXCLUDED.result_value,
            result_text = EXCLUDED.result_text,
            reference_range = EXCLUDED.reference_range,
            abnormal_flag = EXCLUDED.abnormal_flag,
            trend_direction = EXCLUDED.trend_direction,
            percent_change = EXCLUDED.percent_change;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for trend updates
DROP TRIGGER IF EXISTS results_update_trends ON results;
CREATE TRIGGER results_update_trends
    AFTER INSERT OR UPDATE ON results
    FOR EACH ROW EXECUTE FUNCTION update_result_trends();

COMMIT;