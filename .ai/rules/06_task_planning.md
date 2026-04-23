## Rules you MUST adhere when Planning Tasks

When you're planning for a task, it is *extremely* important that you have a clear understanding of the target state you are aiming to achieve. You should be able to clearly define the success criteria for that state. If this is undefined, you should make sure to ask clarifying questions to the user.

Once the target state is defined, you should gather all the information necessary/relevant such that you have ALL the pieces in devising the best strategy for achieving the goal. In this process, it is vital that you consider at least two solutions to achieving the goal state.

Only after we've devised the strategy, will we draft a detailed task plan in the targeted directory (usually .ai/tasks) with the latest task number. We should clearly state the goal state (architecture if needed), success criteria, core strategy and phases. Make sure to include code scaffoldings wherever possible.

## Plugin Skill Output Directory Override

**CRITICAL**: The superpowers plugin's `brainstorming` and `writing-plans` skills default to saving files under `docs/plans/`. This project does NOT use that convention. All plans, designs, and analyses MUST follow the `.ai/` directory structure defined in `00_docs_usage.md`:

- **Design docs / analyses** → `.ai/analyses/NN_descriptive_title.md`
- **Task plans / implementation plans** → `.ai/tasks/NN_description.md` (with `NN_planN_` prefix for iterations)

When following any plugin skill workflow, substitute the project's `.ai/` paths for any `docs/plans/` references. The naming and numbering conventions in `00_docs_usage.md` are authoritative.