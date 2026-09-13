"""External verification survives Android terminating the app during deletion."""
import json,subprocess,time
from pathlib import Path
root=Path(__file__).resolve().parents[1]
def adb(*args):return subprocess.run(['adb',*args],text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
def owned_files():
 internal=adb('shell','run-as','app.kairos.money','find','.','-type','f')
 assert internal.returncode == 0, f'Could not inspect private storage: {internal.stdout}'
 external=adb('shell','if [ -d /sdcard/Android/data/app.kairos.money ]; then find /sdcard/Android/data/app.kairos.money -type f; fi')
 assert external.returncode == 0, f'Could not inspect app-owned external storage: {external.stdout}'
 return [line.strip() for line in (internal.stdout+'\n'+external.stdout).splitlines() if line.strip()]
before=owned_files()
assert any('kairos-moneySQLite.db' in name for name in before), 'Expected populated synthetic app database before deletion'
result=adb('shell','am','instrument','-w','-e','class','app.kairos.money.DeleteInstrumentedTest','app.kairos.money.test/androidx.test.runner.AndroidJUnitRunner')
(root/'docs/evidence/android-delete-instrumentation.log').write_text(result.stdout)
for _ in range(30):
 after=owned_files()
 if not after:break
 time.sleep(1)
assert not after, f'App-owned files remain after deletion: {after}'
report={'method':'Real Settings confirmation -> Android clearApplicationUserData','files_before':len(before),'files_after':len(after),'database_exists_after':False,'rows_after':0,'scope':'All private app files, cache, WebView storage and app-owned external files; user-chosen exports and installed APK excluded'}
(root/'docs/evidence/android-delete.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
