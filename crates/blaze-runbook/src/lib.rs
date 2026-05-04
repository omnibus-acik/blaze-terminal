//! Markdown runbook parser and executor.
//!
//! A runbook is a `.md` file. Optional YAML frontmatter holds metadata; each
//! fenced shell block is one step. The step's title is the most recent
//! heading above the block; if none, "Step N".
//!
//! Out of v0.1 scope (deferred): variables (`{{var}}`), secrets
//! (`{{secret:NAME}}`), per-step directives (`bash blaze: name=…`), full
//! frontmatter (we keep just `name` and `description` for now).
//!
//! ```
//! use blaze_runbook::parse;
//!
//! let book = parse("---\nname: Deploy\n---\n\n## Build\n\n```bash\nmake\n```\n").unwrap();
//! assert_eq!(book.name.as_deref(), Some("Deploy"));
//! assert_eq!(book.steps.len(), 1);
//! assert_eq!(book.steps[0].command, "make");
//! ```

pub mod fs;
pub mod parser;
pub mod writer;

pub use fs::{list_runbooks, load_runbook, RunbookSummary};
pub use parser::{parse, ParseError, Runbook, Step};
pub use writer::{save_runbook, slugify, SaveError, SaveRequest, SaveResult, SaveStep};
