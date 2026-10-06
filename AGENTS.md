<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->
- Concurrency: project/task saves go through *_versioned RPCs (expected updated_at) via a per-entity serializer in src/lib/concurrency.ts; next state is computed before setState. Why: no silent overwrites, ordered intents, no dependence on deferred updaters.
