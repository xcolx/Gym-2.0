# Gym 2.0 iOS

The iOS app (iOS 17 or later), written in SwiftUI with SwiftData. It is the source of truth for the
[web app](../web/README.md), which mirrors its screens and behavior.

The app is offline-first: every screen reads and writes the local SwiftData store, and the sync
([Core/Services/Sync](Gym%202.0/Core/Services/Sync)) pushes the local changes to the [backend](../backend/README.md)
and pulls the server's. The app has no third-party dependencies.

## Running it

Open [Gym 2.0.xcodeproj](Gym%202.0.xcodeproj) in Xcode and run the `Gym 2.0` scheme on a simulator. To run it on a
device, select your own team under Signing & Capabilities (and change the bundle identifier if needed).

The app uses the production API (`https://api.gym2.app/v1`) by default. To use the local backend of the development
stack (see [backend/README.md](../backend/README.md#running-it)), change `APIConfiguration.baseURL` in
[APIClient.swift](Gym%202.0/Core/Networking/APIClient.swift) to `http://localhost:5000/v1`; the simulator reaches the
host machine at `localhost`. Don't commit that change.

## Project layout

```
ios/
  Gym 2.0/
    App/              the app entry point (Gym_2_0App), AppEnvironment (builds the API client and the services once),
                      RootView and MainView (the tab bar)
    Core/
      Domain/         pure logic: units, statistics, fuzzy search, password policy
      Networking/     APIClient, the endpoints and the DTOs of the API
      Persistence/    the SwiftData container, the versioned schemas and their migration plan, model helpers
      Repositories/   how the view models read and write the store
      Services/       one service per API resource, and Sync/, which keeps the store in sync with the backend
      Storage/        small values kept outside SwiftData (Keychain, theme, drafts)
      Utilities/      date formatting
    DesignSystem/     shared views (highlighted body, photo viewer, server images, profile icons)
    Features/         one folder per area: Auth, Home, Workout, Stats, Chat, Settings, AppUpdate and LegacyImport
                      (the import of the data of earlier app versions)
    Resources/        assets, launch screen, privacy manifest
  Gym 2.0Tests/       the unit tests
```

A screen consists of its view and, if it has logic, a view model next to it. View models get the services from
AppEnvironment and use the repositories for the store; views keep `@Query` for their live lists. Changes to the
SwiftData models need a new `VersionedSchemaV<n>` in `Core/Persistence/Schema`, a stage in `MigrationPlan.swift` and
the `CurrentVersionOfSchema` typealias pointing to it.

## Testing

The `Gym 2.0Tests` target (Swift Testing) covers the domain logic, the networking, the persistence and its
migrations, the sync, the legacy import and the view models. The network is stubbed (`Support/StubURLProtocol.swift`,
`Support/FakeBackend.swift`), so the tests need no backend. Run them in Xcode with ⌘U on the `Gym 2.0` scheme, or
from the repository root:

```bash
xcodebuild test -project "ios/Gym 2.0.xcodeproj" -scheme "Gym 2.0" \
  -destination "platform=iOS Simulator,name=iPhone 17 Pro" CODE_SIGNING_ALLOWED=NO
```

CI ([.github/workflows/ci.yml](../.github/workflows/ci.yml)) builds the app and runs the tests on every push and pull
request to `main`, with code coverage. It fails when the line coverage of the app drops below `MIN_COVERAGE` in the
workflow, raise it when the coverage grows. Locally, add `-enableCodeCoverage YES -resultBundlePath TestResults.xcresult`
and read the report with `xcrun xccov view --report --only-targets TestResults.xcresult`.

## Releases

The app uses the production API, App Review too, so release the server changes a version needs first (see
[Releases](../infra/README.md#releases) in the infra README). Then, for each upload to App Store Connect:

1. Raise the version in the target's General tab in Xcode: `MARKETING_VERSION` (`3.1.0`; major for big changes,
   minor for new features, patch for fixes) and `CURRENT_PROJECT_VERSION`, the build number, which goes up with every
   upload, also those only for TestFlight.
2. Archive and upload a commit of `main` whose CI run passed (Product → Archive).
3. Tag that commit `ios-v<version>+<build>`. The tag marks the source of the version in the App Store.

```bash
git tag ios-v3.1.0+42
git push origin ios-v3.1.0+42
```

If a released version needs a fix while `main` already has changes that aren't ready to ship, fix it on `main` first
and cherry-pick the fix onto a release branch made from the tag:

```bash
git switch -c release/ios-3.1 ios-v3.1.0+42
git cherry-pick <commit of the fix>
```

Raise the patch version and the build number there, run the tests locally (CI only runs on `main`), upload and tag
the commit as above. Delete the branch once the next version from `main` is released.
