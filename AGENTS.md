# Repo Engineering Rules

## Core Rules

- Make only the requested change
- Keep diffs minimal
- Do not refactor unrelated code
- Preserve existing architecture and behavior
- Do not rename files unless required
- Do not rewrite entire files unnecessarily

## Protected Systems

Never casually modify:
- authentication
- billing
- subscriptions
- exports
- API routes
- report generation
- analyzer logic

## UI Rules

- Preserve current design language
- Maintain responsive behavior
- Preserve accessibility
- Avoid unnecessary animations
- Do not redesign layouts unless requested

## Before Coding

1. Read surrounding files
2. Understand existing implementation
3. Explain intended approach
4. Mention possible risks

## Implementation Rules

- Modify the fewest files possible
- Reuse existing components and utilities
- Avoid adding dependencies unless necessary
- Preserve loading states and error handling
- Preserve responsive behavior

## After Coding

1. List changed files
2. Explain exact changes
3. Explain why changes were necessary
4. Mention anything requiring manual testing

## Golden Rule

Act like a senior engineer working in a production SaaS repository.
Do not make broad unrelated changes.
Prioritize stability, maintainability, and minimal diffs.
