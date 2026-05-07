# Architecture Overview

## Purpose

This document explains how the project is organized so future developers and AI coding agents can make safer changes.

## Project Type

This is a report and analyzer product. Treat the application as production sensitive.

## Core Product Areas

### Analyzer

The analyzer is responsible for processing user input and preparing analysis results.

Be careful when changing:

1. Analyzer loading behavior
2. Analyzer state handling
3. Retry behavior
4. API calls related to analysis
5. Result parsing
6. Error handling

### Reports

Reports display processed results to the user.

Be careful when changing:

1. Report layout
2. Report calculations
3. Report rendering
4. Report export behavior
5. Report loading states
6. Empty states

### Authentication

Authentication controls user access.

Do not modify authentication unless the task specifically requires it.

### Billing and Subscriptions

Billing and subscription logic are production critical.

Do not modify billing or subscription code unless explicitly requested.

### API Routes

API routes should be changed carefully.

Before changing an API route, inspect:

1. Request shape
2. Response shape
3. Error handling
4. Authentication requirements
5. Rate limiting
6. Downstream usage

## Frontend Rules

1. Reuse existing components
2. Follow existing styling patterns
3. Preserve responsive behavior
4. Preserve accessibility
5. Avoid unnecessary UI rewrites

## Backend Rules

1. Preserve existing request and response contracts
2. Validate input
3. Preserve error handling
4. Avoid exposing sensitive data
5. Avoid changing unrelated endpoints

## Data Flow

When changing behavior, trace the full flow:

1. User action
2. Component state
3. API request
4. API response
5. Data transformation
6. UI rendering
7. Error or loading state

## Safe Change Strategy

Preferred order:

1. Small targeted fix
2. Local component update
3. Shared utility update only if needed
4. API update only if required
5. Architecture change only with explicit approval

## Manual Testing Areas

For most changes, test:

1. Login flow
2. Analyzer load
3. Report generation
4. Report display
5. Export behavior
6. Error state
7. Mobile layout
8. Desktop layout

## Golden Rule

If a change could affect reports, analyzer behavior, authentication, billing, exports, or API routes, treat it as high risk and keep the change as small as possible.
