import sqlite3
import pathlib

db = pathlib.Path('/data/database.sqlite')
con = sqlite3.connect(db)
cur = con.cursor()
cur.execute(
    "UPDATE proxy_host SET forward_host=? WHERE id IN (1,2)",
    ('192.168.15.245',),
)
con.commit()
print(cur.execute(
    'SELECT id, domain_names, forward_host, forward_port FROM proxy_host WHERE id IN (1,2)'
).fetchall())
con.close()

for name in ('1.conf', '2.conf'):
    p = pathlib.Path('/data/nginx/proxy_host') / name
    text = p.read_text()
    fixed = text.replace('host.docker.internal', '192.168.15.245')
    if fixed != text:
        p.write_text(fixed)
        print(f'{name}: patched')
    else:
        print(f'{name}: already ok')
