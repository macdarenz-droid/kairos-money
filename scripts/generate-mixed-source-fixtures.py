"""Deterministic, synthetic March inputs for the Session 2.5 source-order gate."""
from pathlib import Path
import csv
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

out = Path(__file__).resolve().parents[1] / 'fixtures/mixed-source'
out.mkdir(parents=True, exist_ok=True)
pdfmetrics.registerFont(TTFont('FixtureSans', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
rows = [[f'2026-03-{day:02d}', f'Synthetic merchant {chr(65 + i)}', f'-{i + 1}.00']
        for i, day in enumerate([2, 4, 7, 10, 13, 15, 18, 20, 21])]
c = canvas.Canvas(str(out / 'march-statement.pdf'), pagesize=(595, 842), invariant=1)
c.setTitle('Synthetic March statement - test data only')
c.setFont('FixtureSans', 11)
c.drawString(40, 800, 'Synthetic test statement - not a real bank account')
c.drawString(40, 775, 'Statement period: 1 March 2026 to 31 March 2026')
c.drawString(40, 750, 'Opening balance: 1000.00 AUD')
for x, label in zip([40, 175, 455], ['Date', 'Description', 'Amount']):
    c.drawString(x, 705, label)
for i, row in enumerate(rows):
    for x, value in zip([40, 175, 455], row):
        c.drawString(x, 675 - i * 29, value)
c.drawString(40, 365, 'Closing balance: 955.00 AUD')
c.drawString(40, 40, 'Page 1')
c.save()
for week in range(3):
    with (out / f'week-{week + 1}.csv').open('w', newline='') as stream:
        writer = csv.writer(stream)
        writer.writerow(['Date', 'Description', 'Amount'])
        # Extra export detail distinguishes the preferred row without changing
        # normalized merchant identity.
        writer.writerows([[day, 'EFTPOS ' + merchant, amount]
                          for day, merchant, amount in rows[week * 3:week * 3 + 3]])
