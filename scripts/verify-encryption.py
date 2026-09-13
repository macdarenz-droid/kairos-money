"""Host SQLCipher portability proof. This is not Android execution evidence."""
import json, secrets, sqlite3, tempfile
from pathlib import Path
from sqlcipher3 import dbapi2 as cipher
root=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='kairos-encryption-') as temp:
 path=Path(temp)/'encrypted.sqlite';key=secrets.token_hex(32)
 db=cipher.connect(str(path));db.execute(f"PRAGMA key=\"x'{key}'\"")
 version=db.execute('PRAGMA cipher_version').fetchone()[0]
 db.executescript((root/'src/core/db/migrations/0001_foundation.up.sql').read_text())
 db.execute("INSERT INTO accounts(id,name,type,currency,opening_balance_minor) VALUES('synthetic','SYNTHETIC ENCRYPTION SENTINEL','checking','AUD',12345)");db.commit();db.close()
 raw=path.read_bytes();assert not raw.startswith(b'SQLite format 3');assert b'SYNTHETIC ENCRYPTION SENTINEL' not in raw
 plain=sqlite3.connect(str(path))
 try:
  plain.execute('SELECT * FROM accounts').fetchall();raise AssertionError('Plain SQLite read encrypted data')
 except sqlite3.DatabaseError:pass
 finally:plain.close()
 wrong=cipher.connect(str(path));wrong.execute("PRAGMA key='incorrect-test-key'")
 try:
  wrong.execute('SELECT * FROM accounts').fetchall();raise AssertionError('Wrong key read encrypted data')
 except cipher.DatabaseError:pass
 finally:wrong.close()
 correct=cipher.connect(str(path));correct.execute(f"PRAGMA key=\"x'{key}'\"");assert correct.execute('SELECT opening_balance_minor FROM accounts').fetchone()[0]==12345;correct.close()
 path.unlink();assert list(Path(temp).iterdir())==[]
 result={'scope':'Host SQLCipher; Android proof is a separate gate','cipher_version':version,'plain_sqlite_rejected':True,'wrong_key_rejected':True,'sentinel_absent_from_raw_file':True,'correct_key_reads_exact_minor_units':True,'fixture_files_after_delete':0}
 (root/'docs/evidence').mkdir(exist_ok=True);(root/'docs/evidence/encryption-host.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
