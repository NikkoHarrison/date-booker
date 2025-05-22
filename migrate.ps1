$env:PGPASSWORD = "ju2ynmwXvfKAWrLO"
Get-Content "supabase/migrations/20240320000000_add_instances.sql" | docker run --rm -i postgres:latest psql "host=db.zukrrpxianksfmfoioor.supabase.co port=5432 dbname=postgres user=postgres sslmode=require"
$env:PGPASSWORD = "" 