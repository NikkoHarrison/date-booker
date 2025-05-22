-- Create a function that can execute SQL statements
create or replace function exec_sql(sql text)
returns void
language plpgsql
security definer
as $$
begin
  execute sql;
end;
$$;

-- Grant execute permission to authenticated users
grant execute on function exec_sql(text) to authenticated; 