# Kit solution project (the managed release artifact)

Never looked inside a solution zip? Start with the orientation in
[docs/deployment.md](../../docs/deployment.md) (the ALM chapter): what the zip
contains, who normally writes those files, and what each file in this folder
contributes. This README is the operational card only.

`D365UIKit.cdsproj` packs the five PCF controls (Release builds) and the three
shell webresources into one solution zip, from the repo alone:

```powershell
npm run build                                  # webresource artifacts into dist/
dotnet build deployment/solution -c Release    # managed zip in deployment/solution/bin/Release/D365UIKit.zip
```

The default output is **managed** (the release artifact; CI publishes it as
`managed-solution`). For an unmanaged dev import instead:

```powershell
dotnet build deployment/solution -c Release -p:SolutionPackageType=Unmanaged
pac solution import --path deployment/solution/bin/Release/D365UIKit.zip --force-overwrite --publish-changes
```

Release verification is in the ALM chapter; "clean" there is three checks: no
custom control sharing the kit controls' namespace under any publisher
(control identity ignores the prefix), no components carrying the zip's
publisher prefix, and no existing solution using the zip's unique name. In
practice that means a fresh trial org: an org already running the kit's
controls fails the first check under any publisher.

## The demo sample solution (separate artifact)

The managed **sample solution** on the Releases page is a different thing: a
ready-to-try demo exported from a dev org (the sample app, forms, and views).
It ships under its own demo publisher rather than the repo's source prefix,
so its component names will not match what you build from the repo, and
importing it never collides with your own build. Exported zips dropped here
are gitignored; attach them to a GitHub release rather than committing them:

```bash
gh release create vX.Y.Z deployment/solution/d365KitSampleSolution_managed.zip
```
