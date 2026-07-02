# Why there is no View file here

Every other sample keeps its View beside its ViewModel. This one's rendering
lives in `shared/features/counterparty/` instead, because the SAME grid ships
twice: here as a webresource app, and as the `KitCounterpartyGrid` dataset
PCF. Code consumed by two delivery surfaces moves to `shared/features/` (a
demarcated shared-feature area, deliberately not part of the portable kit
modules); this folder holds only what is webresource-specific, the ViewModel
that sources a page of activities through the Web API and the app
registration.
