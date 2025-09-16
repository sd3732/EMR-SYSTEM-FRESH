import pkg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const { Pool } = pkg;
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function setupAuthentication() {
  try {
    console.log('🔐 Setting up EMR Authentication System...\n');

    // Check if users table already exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      );
    `);

    if (tableCheck.rows[0].exists) {
      console.log('✅ Users table already exists');
      
      // Check if admin user exists
      const adminCheck = await pool.query(
        'SELECT id FROM users WHERE email = $1',
        ['admin@emr.local']
      );
      
      if (adminCheck.rows.length > 0) {
        console.log('✅ Default admin user already exists');
      } else {
        console.log('❌ Users table exists but no admin user found');
        process.exit(1);
      }
    } else {
      console.log('📁 Running users table migration...');
      
      // Read and execute the migration
      const migrationPath = path.join(process.cwd(), 'sql', '032_create_users_table.sql');
      const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
      
      await pool.query(migrationSQL);
      console.log('✅ Users table created successfully');
      console.log('✅ Default admin user created');
    }

    // Test authentication setup
    console.log('\n🧪 Testing authentication setup...');
    
    const testUser = await pool.query(
      'SELECT id, email, first_name, last_name, role, active FROM users WHERE email = $1',
      ['admin@emr.local']
    );

    if (testUser.rows.length > 0) {
      const user = testUser.rows[0];
      console.log('✅ Default admin user details:');
      console.log(`   ID: ${user.id}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Name: ${user.first_name} ${user.last_name}`);
      console.log(`   Role: ${user.role}`);
      console.log(`   Active: ${user.active}`);
      console.log(`   Password: admin123 (change this in production!)`);
    }

    console.log('\n🎉 Authentication system setup complete!');
    console.log('\n📋 Next steps:');
    console.log('1. Update your .env file with JWT_SECRET and JWT_EXPIRES_IN');
    console.log('2. Start your server: npm run dev');
    console.log('3. Test login with: admin@emr.local / admin123');
    console.log('4. Change the default admin password in production!');

  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

setupAuthentication();