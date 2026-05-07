# Contributing Guide

## Purpose

This project should be changed carefully. All changes should be small, clear, and easy to review.

## Before Making Changes

1. Understand the requested task
2. Inspect relevant files
3. Identify affected systems
4. Avoid unrelated changes
5. Confirm the smallest safe approach

## Change Rules

1. Make only the requested change
2. Keep diffs minimal
3. Do not refactor unrelated code
4. Do not rename files unless required
5. Do not change package versions unless required
6. Do not modify environment variables unless required
7. Do not rewrite entire files unnecessarily

## Protected Areas

Be extra careful with:

1. Authentication
2. Billing
3. Subscriptions
4. Report generation
5. Analyzer logic
6. Exports
7. API routes
8. Environment variables
9. Deployment settings

## UI Rules

1. Preserve existing design language
2. Keep spacing and typography consistent
3. Maintain responsive behavior
4. Preserve accessibility
5. Avoid unnecessary animations
6. Do not redesign unless requested

## Pull Request Checklist

Before submitting changes, confirm:

1. The change matches the request
2. No unrelated files were modified
3. Existing behavior was preserved
4. Loading and error states still work
5. Mobile and desktop layouts still work
6. No secrets or sensitive data were exposed
7. Manual testing notes are included

## Final Response Format

When reporting completed work, include:

1. Files changed
2. What changed
3. Why it changed
4. What should be tested manually
5. Any known risks
