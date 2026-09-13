# Transaction source boundary

FileSource is the only enabled TransactionSource. It owns detection, offline extraction and parser selection and returns a normalized Document for staging, reconciliation, review and atomic commit. UI and downstream ledger modules import the source boundary rather than file parsers. The legacy statement entry points delegate to this boundary so the frozen Session 2 tests remain valid.

Preference is OFX/QIF, CSV/XLSX, PDF text, then OCR. Source preference controls canonical fields; every contribution remains in transaction_sources. Unique corroboration is consolidated before pending settlement matching. A changed-amount settlement preserves the pending ID and records its before/after values. Multiple plausible candidates require row review. Rebuilding from surviving sources restores pending values on rollback while retaining audit history.

The CommBank and Westpac adapters share shape inference. An issuer name chooses the adapter identity, never a fixed column layout. Header fingerprints identify meanings; headerless inference uses dates, signs and text. Ambiguous dates, extra numeric columns or incomplete assignments require in-place mapping. Saved mappings are checked against the file signature before reuse. Synthetic fixtures are not claims about every current bank export variant.

CdrSource compiles behind an immutable disabled flag and throws an unavailable error. A future implementation must provide explicit account/currency identity, bounded coverage, pending semantics, source provenance, integrity metadata, cancellation and errors, and feed the same review/commit boundary. It must separately satisfy provider consent/accreditation, secure storage and the product's architecture decision. No CDR auth, API calls, email watchers or banking credentials are implemented. Credential scraping remains excluded.

Alternative: attach bank-specific parsing directly to UI or repository code. Rejected because it couples future sources to persistence and bypasses the common review contract. A dependency test protects the seam.
