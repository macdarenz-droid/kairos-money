# AI assistant

Kairos can optionally use an OpenAI chat-completions model for two user-requested tasks:

- Turn a natural-language question into a constrained, read-only ledger query. Kairos executes the query and computes every amount locally, then shows matching transactions as evidence.
- Suggest a category for the transaction currently open in import review. Suggestions never write to the ledger. Confirming a correction can create the existing merchant rule when the user selects that option.

The Insights screen also shows deterministic cash-flow estimates, possible recurring payments and unusual-amount flags. These calculations use committed transactions and statement coverage; they do not use model-generated amounts. Forecasts require at least 45 covered days within the last 90 days, statement coverage updated within seven days, a verified closing balance, and continuous coverage from that balance through the latest imported date. Only checking, savings and cash accounts contribute. The estimate applies recent income and spending pace, subtracts pending commitments and reserves one week of projected spending.

## Setup

1. Open **You → AI assistant**.
2. Enter an OpenAI API key and a chat-completions model name. `gpt-4o-mini` is the default.
3. Save. The key is stored in Android encrypted preferences and is never returned to the WebView.

Removing the key disables model features. AI requests are made only after the user submits a question or requests a category suggestion. Questions send the question, current date and account identifiers/names/currencies to OpenAI. Category requests send one selected transaction's merchant, description, amount direction, currency, merchant category code and pending status. The whole statement and ledger are not sent. API usage may incur charges on the user's OpenAI account.

The Android manifest includes internet access for these requests. OCR and statement parsing continue to run on-device. There is no model-driven ledger write, and the assistant's output is validated against supported date ranges, account IDs and category names.
