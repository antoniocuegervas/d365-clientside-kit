# Sample solution (release artifact)

The managed sample solution exported from a dev org goes here, for example
`d365KitSampleSolution_managed.zip`. These zips are **gitignored**: a binary solution
is a release artifact, not source, so attach it to a GitHub release rather than
committing it:

```bash
gh release create vX.Y.Z deployment/solution/d365KitSampleSolution_managed.zip
```

The repo ships the kit as source under the `new_` publisher (change it to your own in
`kit.config.json`). This managed solution is a separate, ready-to-try demo built under
the `acueger_` publisher: import it, open the `d365KitSamples` app, then uninstall it
cleanly when done. The two are intentionally decoupled, the source is a template you
make your own, the managed solution is a self-contained demo.
