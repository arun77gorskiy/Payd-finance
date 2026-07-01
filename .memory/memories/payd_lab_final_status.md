# PAYD Trading Lab — Final Status

## Bug Fixed (2026-07-01)
Race condition in `public/js/lab-trainer-component.js` between async `mount()` and sync `start()`.

**Root cause**: `startModuleScenario()` in `index.html` (line ~16680) called:
```js
window.LabTrainer.mount('lab-trainer-mount');   // NOT awaited
window.LabTrainer.start(moduleIndex);           // called immediately
```
`mount()` is async (awaits `lightweight-charts`), but `start()` ran before `mounted=true`.
Old `start()` had `if (!this.mounted) return;` → screen stuck on "Загрузка сценария".

**Solution**:
1. Added `this._mountPromise` in constructor
2. `mount()` returns cached promise (idempotent)
3. `start()` awaits `_mountPromise` if mount still running
4. `back()` resets `mounted`, `_mountPromise`, `trainer` for re-mount
5. `destroy()` also resets `_mountPromise`

## E2E Verification (browser-tested)
- Module 1, 2, 3, 4 all load correctly
- Chart + decision panel visible
- Result screen works
- "Back to modules" works

## Module 3 & 4
Stay as empty stubs (no business logic), per user requirement.

## Deployed URL
https://4ij5ha2h9y3o.space.minimax.io/lab.html

## Files Modified
- `public/js/lab-trainer-component.js` (race condition fix + diagnostics)
- `public/js/Trainer.js` (diagnostic logging only)
