"""Synthetic parser fixtures only; never imported by production code."""
from pathlib import Path
import csv, json, subprocess
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
pdfmetrics.registerFont(TTFont('FixtureSans', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'fixtures/ingest'
OUT.mkdir(exist_ok=True)
manifest=[]
for kind in ['checking','savings','credit']:
    for layout in range(3):
        name=f'synthetic-{kind}-{layout+1}'
        signed=['10.00','20.00','30.00'] if kind=='credit' else ['-10.00','-20.00','-30.00']
        if layout==0:
            header=['Date','Description','Amount']; xs=[40,170,430]
            rows=[[f'0{i+1}/01/2026',f'Synthetic merchant {chr(65+i)}',signed[i]] for i in range(3)]
        elif layout==1:
            header=['Date','Details','Debit','Credit']; xs=[40,170,410,490]
            rows=[[f'0{i+1}/01/2026',f'Synthetic merchant {chr(65+i)}',f'{(i+1)*10}.00',''] for i in range(3)]
        else:
            header=['Description','Date','Amount']; xs=[40,300,450]
            rows=[[f'Synthetic merchant {chr(65+i)}',f'0{i+1}/01/2026',signed[i]] for i in range(3)]
        with (OUT/(name+'.csv')).open('w',newline='') as f:csv.writer(f).writerows([header,*rows])
        c=canvas.Canvas(str(OUT/(name+'.pdf')),pagesize=(595,842),invariant=1)
        chunks=[rows] if layout!=2 else [rows[:2],rows[2:]]
        for page,chunk in enumerate(chunks,1):
            c.setFont('FixtureSans',11); c.drawString(40,800,'SYNTHETIC TEST STATEMENT - NOT A REAL ACCOUNT')
            c.drawString(40,777,kind+' account / January 2026')
            for x,text in zip(xs,header):c.drawString(x,720,text)
            for i,row in enumerate(chunk):
                for x,text in zip(xs,row):c.drawString(x,685-i*30,text)
            c.drawString(40,40,f'Page {page}'); c.showPage()
        c.save()
        manifest.append({'name':name,'kind':kind,'layout':layout+1,'expected_minor':['-1000','-2000','-3000'],'rows':3})
for layout,sep in enumerate([': ', ' | ', ':    '],1):
    name=f'synthetic-payslip-{layout}'
    pairs=[('Employer','Synthetic employer'),('Pay date','15/01/2026'),('Period start','01/01/2026'),('Period end','14/01/2026'),('Gross','2000.00'),('Net','1600.00'),('Tax','400.00'),('Super','240.00'),('YTD Gross','12000.00'),('YTD Tax','2400.00')]
    if layout==2:pairs=pairs[3:]+pairs[:3]
    text='\n'.join(k+sep+v for k,v in pairs)
    (OUT/(name+'.txt')).write_text(text+'\n')
    c=canvas.Canvas(str(OUT/(name+'.pdf')),pagesize=(595,842),invariant=1)
    c.setFont('FixtureSans',12);c.drawString(40,800,'SYNTHETIC PAYSLIP - NOT REAL EMPLOYMENT')
    for i,(key,value) in enumerate(pairs):
        c.drawString(40,755-i*28,key+sep); c.drawString(260,755-i*28,value)
    c.save();manifest.append({'name':name,'kind':'payslip','layout':layout,'net_minor':'160000'})
for kind in ['checking','savings','credit','payslip']:
    source=OUT/f'synthetic-{kind}-1.pdf'; prefix=OUT/f'synthetic-{kind}-scan'
    subprocess.run(['pdftoppm','-f','1','-singlefile','-scale-to','2000','-png',str(source),str(prefix)],check=True)
    c=canvas.Canvas(str(prefix.with_suffix('.pdf')),pagesize=(595,842),invariant=1)
    c.drawImage(ImageReader(str(prefix.with_suffix('.png'))),0,0,width=595,height=842);c.showPage();c.save()
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
