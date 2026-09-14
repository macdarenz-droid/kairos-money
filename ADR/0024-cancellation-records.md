# 0024 — Local cancellation progress and statement follow-up

Store cancellation progress as encrypted app_settings entries keyed by normalized merchant and currency, matching the existing recurring-cost grouping across accounts. Each value records requested/provider-confirmed status, contact/confirmation date and a note. Provider-confirmed status requires a note/reference. Existing backup, restore and deletion include the records; no storage version change is needed.

Keep records visible after recurrence detection no longer finds the merchant. Link to covered, settled, non-transfer debits on later dates so the user can inspect source evidence. Same-day ordering cannot be inferred. Missing imports and final provider charges remain explicit limitations.

Do not remove bills from the forecast, change statement transactions or create coverage based on this user record. An optimistic cancellation override could increase safe-to-spend before charges actually stop. This workflow records provider contact and supports verification; it cannot cancel a contract. Actual both-theme Android acceptance remains part of the combined Session 4 gate.
