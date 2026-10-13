# Public repository release review

Reviewed on **2026-10-13**. Repository: [kulieff21/RelayOps](https://github.com/kulieff21/RelayOps).
The application is a reviewable local portfolio sandbox with reproducible setup and
English/Azerbaijani behavior. Hosting is outside this release.

## Reviewed scope

The application-code snapshot is `5c17b2bf9ebc0bdb0bda4e4e72d8834eac21b6dc`.
Release changes correct the portfolio test-count transcription, add this review and
README navigation, and expand CI verification. No business-service or frozen-evaluation
implementation is changed. The final publication commit is recorded in the local
project/session handoff and GitHub's commit history.

| Area                    | Review                                                                                                                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Intended public content | Source, immutable migrations, synthetic fixtures, documentation, license/notices, twelve JPEG captures and the edited recording. Runtime databases, `.env`, raw evaluation artifacts and local agent/session files remain excluded.                                             |
| History                 | Local review examined all 26 reachable commits and 410 unique historical blobs before this release commit, including binary content. No known saved credential/private numeric integration value, supported credential signature or checked personal-machine path was detected. |
| Fixtures/media          | In-memory seed has only the five intended `.example` accounts. Fourteen manifest files retain their exact hashes; JPEGs have no EXIF entries. Screenshots were visually reviewed; the 33-second silent H.264 recording retains only synthetic demo scenes.                      |
| Documentation           | Local README/document links resolve. GitHub-published bytes, referenced media and repository access are checked after publication.                                                                                                                                              |
| Required checks         | 261 tests, server/web type checks, lint, formatting, production build and public-content scanning; compiled HTTP health/Azerbaijani catalog smoke.                                                                                                                              |
| CI                      | Node 22, locked `npm ci`, full `npm run check` and compiled HTTP smoke on push/PR. `fetch-depth: 0` makes reachable commit history available to the CI scanner. Permissions remain `contents: read`.                                                                            |
| Access                  | Public repository under `kulieff21`; owner/collaborator access is limited to that account. No additional collaborators, deployment or repository are created.                                                                                                                   |
| Preservation            | Original environment, complete logical business/model-ledger databases and all 120 retained main-trial evidence files remain unchanged. No paid inference, Telegram message or supplier/payment request is needed for release verification.                                     |

The full historical-blob/local-machine-path review is a separate local release audit;
the ordinary CI scanner checks its supported signatures, private paths and commit diffs.
These checks describe observed coverage, not a general security certification or proof
that every possible secret representation can be detected.

## Reproduce the public review

Follow [local setup](setup.md), [synthetic demo walkthrough](demo.md) and
[portfolio evidence](portfolio.md). The visitor launcher requires no integration keys.
Run `npm run check`, followed by `node --import tsx scripts/smoke.ts` after the build.
Use a separate checkout for reset or receipt experiments; preserve any real local
model spending history independently of business-demo reset.

## Release limitations

- The supplier/payment/receipt/delivery integrations are synthetic; no public hosting
  or production authentication/scaling claim is made.
- The original experiment remains fixed 8/8, live 36/40 and assisted human 6/8. Coaching,
  exposure, learning and interface limitations prevent unaided-human or causal labor-savings
  conclusions. Its raw records and frozen source revision are not replaced by this release.
- Node 22 SQLite is experimental; Vite's >500 kB bundle advisory remains non-failing.
- The recording is an edited guided UI walkthrough, not a live-model or elapsed-time benchmark.

See [known limitations](limitations.md) and [actual evaluation results](evaluation-results.md).
