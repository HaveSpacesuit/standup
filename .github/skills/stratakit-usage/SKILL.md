---
name: stratakit-usage
description: Ensures correct StrataKit usage for frontend work. Use when building, reviewing, or refactoring UI code in React and CSS, including MUI components, icons, tokens, and page layouts.
---

# StrataKit Usage

Use these guidelines whenever work touches UI.

## When to use

- Building, reviewing, or refactoring React components.
- Setting up StrataKit in a project.
- Working with MUI components under StrataKit.
- Choosing and rendering icons.
- Styling UI with design tokens.

## Critical rules

- Use StrataKit as the design system.
- Do not introduce other UI systems such as shadcn/ui, Chakra, Ant Design, Radix, Mantine, Bootstrap, Tailwind, or iTwinUI.
- Do not use legacy @stratakit/bricks for new work.
- Do not import from any secret-internals path.
- If StrataKit is missing, set it up first.

## Setup checklist

- Follow the develop guide: https://stratakit.bentley.com/docs/getting-started/develop/
- Install required packages for MUI usage with StrataKit.
- Ensure SVG icons are served as files, not inlined by the bundler.
- Add @stratakit/mui/types.d.ts to TypeScript compiler types.
- Wrap app entry with Root from @stratakit/mui.

## Component usage

- Use components from @mui/material with StrataKit Root.
- Consult StrataKit component docs before using a component.
- Prefer documented usage patterns from examples.
- For heading-like typography variants, provide render with the correct semantic heading element.

## Icon usage

- Use icons only from @stratakit/icons.
- Import icons via package exports, for example: @stratakit/icons/add.svg.
- Do not use @mui/icons-material.
- If needed, inspect available icons in node_modules/@stratakit/icons/icons-list.json.

## Styling and tokens

- Prefer component props and documented patterns first.
- Use StrataKit tokens for spacing, color, and sizing.
- Avoid internal tokens and internal class names.
- Avoid hardcoded visual values when tokens exist.

## Documentation-first workflow

- Start with docs: https://stratakit.bentley.com/docs/
- Follow in-page links to the specific component or guide.
- Validate examples against installed package types when uncertain.
