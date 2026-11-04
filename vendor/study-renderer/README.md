# Retained renderer artifacts

`v2` is the exact unpacked Platform renderer2.0.0 artifact from source `44da4e489dde1f9bbc2ae5cce96912fc0860fa87`, source digest `85abdb7949b6337322cc19d31de1d026736e6d95341e05433c0e618e622ae783`. Its original file manifest is SHA-256 `b0c9bdd08a25b9a4ac22acf135f013602970049851725a9e612fe9e23ef6a50b`; the detached archive receipt records archive SHA-256 `dfbc7aa817996457b2d9a1c5c9d511f39c132e1523f9d1421a3ff1d74c7805fe`. Package tests verify all original file bytes. Do not edit these files or regenerate them from a newer source.

The package retains renderer1.0.0/view1 presentation validation for historical online preview and renders view2 exports with its own exact renderer2 framing. New method view3 exports use the separate current renderer3 artifact. Online preview applies only the Platform-owned `about:srcdoc#` navigation binding to validated semantic content and does not claim export verification.
