# Rule Engine Test Suite

BDD-style description of `src/rule-engine.test.ts`.

---

## Feature: Maximum Severity Calculation (`maxSeverity`)

### Scenario: No findings present

- **Given** an empty list of findings
- **When** `maxSeverity` is called
- **Then** it should return `SAFE`

### Scenario: Multiple findings with varying severities

- **Given** findings with severities `LOW`, `CRITICAL`, and `SAFE`
- **When** `maxSeverity` is called
- **Then** it should return `CRITICAL` (the highest severity)

### Scenario: Multiple findings without CRITICAL severity

- **Given** findings with severities `SAFE`, `SUSPICIOUS`, and `LOW`
- **When** `maxSeverity` is called
- **Then** it should return `SUSPICIOUS` (the highest present severity)

---

## Feature: Rule Engine Analysis (`runRuleEngine`)

### Scenario: Detecting skip annotation and matcher transition on the same file

- **Given** a test file `math.test.ts` where:
  - `it("adds numbers", ...)` was changed to `it.skip("adds numbers", ...)`
  - `.toBe(1)` was changed to `.toEqual(1)`
- **When** the rule engine analyzes the diff
- **Then** it should produce at least one `skip-detector` finding
- **And** it should produce at least one `matcher-transition` finding
- **And** the overall severity should be `CRITICAL`

### Scenario: Detecting tautology and value change together

- **Given** a test file `values.test.ts` where:
  - An expected value was changed from `42` to `99`
  - An assertion `expect(isActive()).toBe(false)` was replaced with `expect(true).toBe(true)`
- **When** the rule engine analyzes the diff
- **Then** it should produce at least one `tautology/*` finding
- **And** it should produce at least one `value-change` finding
- **And** the overall severity should be `CRITICAL`

### Scenario: New test file with no issues

- **Given** a new test file `new.test.ts` (no previous content) containing valid assertions
- **When** the rule engine analyzes the file
- **Then** it should produce at least one `safe/*` finding
- **And** the overall severity should be `SAFE`

### Scenario: Detecting assertion removal and value change on a complex diff

- **Given** a test file `api.test.ts` where:
  - An expected status code was changed from `200` to `201`
  - An assertion `expect(response.data.id).toBe(1)` was removed entirely
- **When** the rule engine analyzes the diff
- **Then** it should produce at least one `value-change` finding
- **And** it should produce at least one `assertion-removal*` finding
- **And** the overall severity should be `CRITICAL`

### Scenario: Respecting assertion-removed severity override

- **Given** a test file `removal.test.ts` where an assertion was removed
- **When** the rule engine runs with the **default** configuration
- **Then** the `assertion-removal*` findings should include `CRITICAL` severity
- **When** the rule engine runs with `assertionRemoved` overridden to `SUSPICIOUS`
- **Then** no `assertion-removal*` finding should have `CRITICAL` severity
- **And** at least one should have `SUSPICIOUS` severity

### Scenario: Respecting matcher transition table overrides

- **Given** a test file `matcher.test.ts` where `.toBe(expected)` was changed to `.toEqual(expected)`
- **When** the rule engine runs with the **default** configuration
- **Then** the `matcher-transition` finding should have `SUSPICIOUS` severity
- **When** the rule engine runs with `toBe->toEqual` overridden to `CRITICAL`
- **Then** the `matcher-transition` finding should have `CRITICAL` severity

### Scenario: Respecting skip annotation severity override

- **Given** a test file `skip.test.ts` where `it("test one", ...)` was changed to `it.skip("test one", ...)`
- **When** the rule engine runs with `skipAnnotation` overridden to `SUSPICIOUS`
- **Then** the `skip-detector` finding should have `SUSPICIOUS` severity

### Scenario: Respecting tautology severity override

- **Given** a test file `taut.test.ts` where `expect(isActive()).toBe(true)` was replaced with `expect(true).toBe(true)`
- **When** the rule engine runs with `tautology.static` overridden to `LOW`
- **Then** all `tautology/*` findings should have `LOW` severity

### Scenario: Including snapshot findings when diffs are provided

- **Given** a test file `app.test.ts` with an associated snapshot diff that changes content from `<div>old</div>` to `<div>new</div>`
- **When** the rule engine analyzes the file with the snapshot diff
- **Then** it should produce at least one `snapshot/*` finding

### Scenario: Returning the correct file path in the result

- **Given** a test file with path `src/utils.test.ts` and empty content
- **When** the rule engine analyzes it
- **Then** `result.filePath` should be `src/utils.test.ts`
- **And** the overall severity should be `SAFE`

### Scenario: Identical content produces no findings

- **Given** a test file `same.test.ts` where before and after content are identical
- **When** the rule engine analyzes the diff
- **Then** the overall severity should be `SAFE`

### Scenario: Multiple rules firing with overall severity as max

- **Given** a test file `multi.test.ts` where:
  - An expected value was changed from `10` to `20`
  - `.toStrictEqual(expected)` was changed to `.toEqual(expected)`
  - `it("test c", ...)` was changed to `it.skip("test c", ...)`
- **When** the rule engine analyzes the diff
- **Then** the findings should include rules `value-change`, `matcher-transition`, and `skip-detector`
- **And** the overall severity should be `CRITICAL`
