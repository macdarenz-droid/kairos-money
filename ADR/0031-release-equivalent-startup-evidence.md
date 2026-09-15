# ADR 0031 — Release-equivalent startup evidence in the combined gate

## Decision

Measure startup with a `benchmark` Android build type that inherits `release`, disables debugging, uses release dependency variants and is signed with the existing CI development key. Do not use or weaken the private release signing path. Verify the packaged APK's signature, application ID, real launcher activity and absence of `application-debuggable` before measuring it.

This follows [Android's benchmark app configuration guidance](https://developer.android.com/topic/performance/benchmarking/macrobenchmark-overview#set-up-app): debug runtime overhead should not be used as release performance evidence. The current release does not enable minification, so the benchmark does not enable it independently either. This is an `am start -W` smoke measurement, not a Macrobenchmark implementation or a physical-device release benchmark.

Keep the exact existing thresholds: median of three force-stopped process-cold launches below 2,000 ms, first post-install launch below 2,500 ms. Require successful `COLD` launch status and retain raw samples. After each measured first frame, wait for the real PIN-setup page before terminating that process. The readiness wait is separately bounded and is not represented as time to full interactivity or silently subtracted from TotalTime.

After measurement, remove only the benchmark installation on the verified fresh emulator and install the debug/instrumentation APKs for the existing native journey. Refuse physical devices and pre-existing Kairos installations before any device mutation. This keeps native fixture assumptions and debug-only inspection intact without turning the benchmark into a distributable release.

## Failure handling

A startup limit or invalid-measurement failure is recorded immediately but does not prevent independent functional evidence. It still makes the final combined gate fail, preventing APK publication. A functional failure stops its state-dependent successors and preserves completed class names plus any startup failure. Never represent a slow but functional run as an overall PASS.

Host tests execute the runner with all subprocesses mocked, checking success, strict boundaries, warm/missing measurements, preserved dual failures, benchmark cleanup ordering, and device safety. Separate manifest tests reject debuggable and wrong-target APKs. Android compilation, runtime timings and all native results still require actual CI evidence.

## Alternatives and limits

Raising the limit or accepting warm launches would weaken acceptance. Stopping the whole gate on timing alone hides useful evidence and leads to repeated incomplete runs. Changing renderers did not demonstrate a startup fix: run 34813835994 measured 2,339 / 2,558 / 2,506 ms on the debug variant. Slow-frame totals include scheduling and traversal as well as rendering, so they do not prove a GPU-only root cause. The new benchmark is a corrected measurement setup; improved startup performance is not claimed before it runs.
