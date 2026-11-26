import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const job = (workflow: string, name: string, nextName?: string) => {
  const start = workflow.indexOf(`  ${name}:`);
  const end = nextName ? workflow.indexOf(`  ${nextName}:`, start) : workflow.length;
  return workflow.slice(start, end);
};

describe('Publication workflow gates', () => {
  it('verifies the reviewed bundle before the manual web build and deploy', () => {
    const workflow = read('.github/workflows/ci.yml');
    const verifyAt = workflow.indexOf('run: pnpm lcia-cache:verify');
    const buildAt = workflow.indexOf('run: pnpm build');
    const deployAt = workflow.indexOf('Deploy to EdgeOne Pages');
    expect(verifyAt).toBeGreaterThan(0);
    expect(verifyAt).toBeLessThan(buildAt);
    expect(buildAt).toBeLessThan(deployAt);
  });

  it('keeps the aggregate gate for dev candidates and explicit release recovery', () => {
    const workflow = read('.github/workflows/build.yml');
    const releaseGate = read('.github/workflows/release-gate.yml');
    expect(releaseGate).toContain(
      'uses: pnpm/setup@731dfb6463bbd11c11fd0ee11fe00ed0e36d48a1 # v3.2.0',
    );
    expect(releaseGate).toContain('run: pnpm install --frozen-lockfile');
    expect(releaseGate).toContain('run: pnpm lcia-cache:verify');
    expect(releaseGate).toContain('run: pnpm release:static-preflight');
    expect(releaseGate).toContain('run: pnpm prepush:gate');
    expect(releaseGate).toContain("TIANGONG_AGENT_MODE: '1'");
    expect(releaseGate).toContain(
      'uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2',
    );
    expect(releaseGate).toContain('path: .local/test-logs/**');
    expect(releaseGate.indexOf('pnpm lcia-cache:verify')).toBeLessThan(
      releaseGate.indexOf('pnpm release:static-preflight'),
    );
    expect(releaseGate.indexOf('pnpm release:static-preflight')).toBeLessThan(
      releaseGate.indexOf('pnpm prepush:gate'),
    );
    expect(releaseGate).not.toContain('run: pnpm test:ci');
    expect(workflow).toContain('uses: ./.github/workflows/release-gate.yml');
    expect(workflow).toContain('release_head: ${{ needs.release-context.outputs.release_head }}');
    expect(workflow).toContain('actions: read');
    expect(workflow).toContain('pull-requests: read');

    const releaseContext = workflow.slice(
      workflow.indexOf('  release-context:'),
      workflow.indexOf('  release-gate:'),
    );
    const fullGate = workflow.slice(
      workflow.indexOf('  release-gate:'),
      workflow.indexOf('  release-qualified:'),
    );
    const releaseQualification = workflow.slice(
      workflow.indexOf('  release-qualified:'),
      workflow.indexOf('  release-tag:'),
    );
    expect(releaseContext).toContain('node scripts/release/release-gate-proof.cjs resolve');
    expect(releaseContext).toContain("github.ref == 'refs/heads/main'");
    expect(fullGate).toContain("needs.release-context.outputs.gate_mode == 'full'");
    expect(releaseQualification).toContain(
      "always() && needs.release-context.outputs.should_release == 'true'",
    );
    expect(releaseQualification).toContain(
      '[ "${GATE_MODE}" = "reuse" ] && [ "${FULL_GATE_RESULT}" = "skipped" ]',
    );
    expect(releaseQualification).toContain(
      '[ "${GATE_MODE}" = "full" ] && [ "${FULL_GATE_RESULT}" = "success" ]',
    );
    expect(releaseQualification).toContain('Normal main pushes never rerun candidate acceptance');

    const webDeploy = workflow.slice(
      workflow.indexOf('  web-deploy:'),
      workflow.indexOf('  release:', workflow.indexOf('  web-deploy:')),
    );
    const electronRelease = workflow.slice(
      workflow.indexOf('  release:', workflow.indexOf('  web-deploy:')),
      workflow.indexOf('  verify-release:'),
    );
    expect(webDeploy).toMatch(/needs:[\s\S]*- release-qualified/);
    expect(webDeploy).toMatch(/needs:[\s\S]*- release-tag/);
    expect(electronRelease).toMatch(/needs:[\s\S]*- release-qualified/);
    expect(electronRelease).toMatch(/needs:[\s\S]*- release-tag/);
  });

  it('keeps the local pre-push gate aligned with the release gate', () => {
    const packageJson = JSON.parse(read('package.json'));
    expect(packageJson.scripts['prepush:gate']).toContain('pnpm lcia-cache:verify');
  });

  it('keeps hermetic browser qualification manual and outside release blocking', () => {
    const semanticWorkflow = read('.github/workflows/i18n-semantic-e2e.yml');
    expect(semanticWorkflow).not.toContain('  workflow_call:');
    expect(semanticWorkflow).toContain('  workflow_dispatch:');
    expect(semanticWorkflow).not.toContain('  pull_request:');
    expect(semanticWorkflow).not.toContain('  push:');
    expect(semanticWorkflow).toContain('ref: ${{ inputs.ref || github.sha }}');
    expect(semanticWorkflow).toContain('Manual Hermetic Semantic Qualification');
    expect(semanticWorkflow).toContain('pnpm --silent e2e:qualification:key');
    expect(semanticWorkflow).toContain('pnpm --silent e2e:qualify');
    expect(semanticWorkflow).toContain('pnpm --silent release:proof:verify');
    expect(semanticWorkflow).toContain('Upload manual semantic qualification proof');
    expect(semanticWorkflow).not.toContain('uses: actions/cache@');
    expect(semanticWorkflow).not.toContain('E2E_PRODUCTION_WRITE_CONFIRMATION');
    expect(semanticWorkflow).not.toContain('E2E_WRITE_VERIFIED_EVIDENCE');
    expect(semanticWorkflow).not.toContain('secrets:');

    const aggregateGate = read('.github/workflows/release-gate.yml');
    expect(aggregateGate).not.toContain('  semantic-qualification:');
    expect(aggregateGate).not.toContain('pnpm --silent e2e:qualification:key');
    expect(aggregateGate).not.toContain('pnpm --silent release:proof:verify');
    expect(aggregateGate).not.toContain('pnpm --silent e2e:qualify');
    expect(aggregateGate).not.toContain('  public-semantic-e2e:');
    expect(aggregateGate).not.toContain('uses: ./.github/workflows/i18n-semantic-e2e.yml');
    expect(aggregateGate).toMatch(
      /release-proof:\n\s+name: Aggregate Exact Release Proof\n\s+needs: release-gate/,
    );
    expect(aggregateGate).not.toContain('secrets:');

    const releaseWorkflow = read('.github/workflows/build.yml');
    expect(releaseWorkflow).not.toContain('  release-semantic-e2e:');

    const publicationJobs = [
      releaseWorkflow.slice(
        releaseWorkflow.indexOf('  release-draft:'),
        releaseWorkflow.indexOf('  web-deploy:'),
      ),
      releaseWorkflow.slice(
        releaseWorkflow.indexOf('  web-deploy:'),
        releaseWorkflow.indexOf('  release:', releaseWorkflow.indexOf('  web-deploy:')),
      ),
      releaseWorkflow.slice(
        releaseWorkflow.indexOf('  release:', releaseWorkflow.indexOf('  web-deploy:')),
        releaseWorkflow.indexOf('  verify-release:'),
      ),
    ];
    for (const publicationJob of publicationJobs) {
      expect(publicationJob).toMatch(/needs:[\s\S]*- release-qualified/);
      expect(publicationJob).toMatch(/needs:[\s\S]*- release-tag/);
    }
  });

  it('reuses proof for promotions and freshly gates exact marked main hotfixes', () => {
    const workflow = read('.github/workflows/release-readiness.yml');
    const releaseGate = read('.github/workflows/release-gate.yml');
    expect(workflow).toContain('pull_request:');
    expect(workflow).toMatch(/branches:\s*\n\s*- dev\s*\n\s*- main/);
    expect(workflow).toContain('uses: ./.github/workflows/release-gate.yml');
    expect(workflow).toContain('candidate-context --event-path "$GITHUB_EVENT_PATH"');
    expect(workflow).toContain(
      'release_base: ${{ needs.release-candidate-context.outputs.release_base }}',
    );
    expect(workflow).toContain(
      'candidate_base: ${{ needs.release-candidate-context.outputs.candidate_base }}',
    );
    expect(workflow).toContain('emit_proof: true');
    expect(workflow).toContain(
      'proof_pr_number: ${{ needs.release-candidate-context.outputs.proof_pr_number }}',
    );
    expect(workflow).toContain('name: Main Candidate / Release Gate');
    expect(workflow).toContain('release-gate-proof.cjs main-candidate-context');
    expect(workflow).toContain("steps.context.outputs.gate_mode == 'hotfix-full'");
    expect(workflow).toContain('pnpm docpact:gate --base "$RELEASE_BASE" --head "$RELEASE_HEAD"');
    expect(workflow).toContain('pnpm release:static-preflight');
    expect(workflow).toContain('pnpm prepush:gate');
    expect(releaseGate).toContain('node scripts/release/release-gate-proof.cjs create');
    expect(releaseGate).toContain('Upload exact aggregate release proof');
    expect(releaseGate).toContain('retention-days: 30');
  });

  it('publishes a release tag only after aggregate release qualification passes', () => {
    const workflow = read('.github/workflows/build.yml');
    const releaseContext = workflow.slice(
      workflow.indexOf('  release-context:'),
      workflow.indexOf('  release-gate:'),
    );
    const releaseTag = workflow.slice(
      workflow.indexOf('  release-tag:'),
      workflow.indexOf('  release-draft:'),
    );

    expect(releaseContext).not.toContain('git tag "${tag_name}"');
    expect(releaseContext).not.toContain('git push origin "refs/tags/${tag_name}"');
    expect(releaseTag).toMatch(/needs:[\s\S]*- release-qualified/);
    expect(releaseTag).not.toContain('release-semantic-e2e');
    expect(releaseTag).toContain('git tag "${TAG_NAME}" "${RELEASE_HEAD}"');
    expect(releaseTag).toContain('git push origin "refs/tags/${TAG_NAME}"');
  });

  it('continues after an intentional proof-reuse skip while every publication dependency succeeds', () => {
    const workflow = read('.github/workflows/build.yml');
    const publicationJobs = [
      {
        source: job(workflow, 'release-tag', 'release-draft'),
        required: ['release-context', 'release-qualified'],
      },
      {
        source: job(workflow, 'release-draft', 'web-deploy'),
        required: ['release-context', 'release-qualified', 'release-tag'],
      },
      {
        source: job(workflow, 'web-deploy', 'release'),
        required: ['release-context', 'release-qualified', 'release-tag'],
      },
      {
        source: job(workflow, 'release', 'verify-release'),
        required: ['release-context', 'release-qualified', 'release-draft', 'release-tag'],
      },
      {
        source: job(workflow, 'verify-release'),
        required: ['release-context', 'release-draft', 'release'],
      },
    ];

    for (const publicationJob of publicationJobs) {
      expect(publicationJob.source).toContain('!cancelled()');
      expect(publicationJob.source).toContain(
        "needs.release-context.outputs.should_release == 'true'",
      );
      for (const dependency of publicationJob.required) {
        expect(publicationJob.source).toContain(`needs.${dependency}.result == 'success'`);
      }
    }
  });
});
