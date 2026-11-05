# Multi-file editor

Choose Code in the tools panel. The editor is docked in the main workspace below the still-mounted circuit. Drag its divider, or focus the divider and use Up/Down/Home/End. On mobile the tools drawer closes when Code is chosen. The editor uses the existing React controls and native text editing; no packages, syntax service or compiler are added.

Board tabs follow the same board-instance context as canvas selection. File tabs and a compact explorer select source files. New/Rename validate names; Delete requires confirmation and supports the existing stopped-mode undo/redo. Source changes dispatch directly to the authoritative project and use existing autosave; the editor reports saving/saved/storage failure. Switching tabs has no separate source buffer to discard.

Supported extensions: `.ino`, `.h`, `.cpp`, `.html`, `.css`, `.js`. Flat names use ASCII letters, digits, underscores, hyphens and periods; maximum 80 characters. Projects allow 40 files and 500,000 total source characters per board, subject to the existing whole-project size limit. Web files are inert text, not executable previews.

The optional v1 `program.files` and `program.activeFile` fields preserve files and active selection per board. Legacy single-source data is exposed as `main.ino` and materialized on the first file operation. The legacy `source` field is a validated projection of the first file. Old application versions cannot retain additional files when roundtripping these projects. New import/export and Redux Persist preserve all files. File operations preserve component, wire and viewport references.

Focused tests cover CRUD, per-board isolation, all extensions, legacy migration, validation, undo/redo, electrical-reference preservation, real Redux Persist save/reload and rendered tab/split structure. Browser interaction was not executed for this change.

Manual acceptance: edit UNO `main.ino`, create/edit `config.h`; select ESP8266 and create/edit its own files. Switch boards and files, rename and delete with confirmation, resize the split, and reload. Verify both boards' contents and active files remain and the circuit is unchanged.
