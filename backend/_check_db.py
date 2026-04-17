import psycopg2
c = psycopg2.connect(host='core.solba.com', port=5026, dbname='postgres', user='SOLBA', password='solba2012', connect_timeout=10)
cur = c.cursor()
cur.execute("SELECT datname, pg_encoding_to_char(encoding), datcollate FROM pg_database WHERE datname ILIKE '%panel%' OR datname ILIKE '%control%'")
for row in cur.fetchall():
    print(f"DB: {row[0]}, encoding: {row[1]}, collate: {row[2]}")
c.close()
