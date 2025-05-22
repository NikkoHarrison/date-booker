@echo off
set PGPASSWORD=CKDoGVHPMSzvtJvu
"C:\Program Files\PostgreSQL\16\bin\pg_restore.exe" -h aws-0-us-east-1.pooler.supabase.com -p 5432 -U postgres.zukrrpxianksfmfoioor -d postgres -v local_dump.backup 