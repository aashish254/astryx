// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The small routing helper the commands that pick among candidates
 * share (build, search): two node kinds and the runner that walks them.
 *
 * A searcher answers a request in its command's own result shape, or returns
 * null to pass. A dispatcher scores nothing: it names the children that should
 * answer, best first, with a confidence from 0 to 1. Below its floor, or when
 * none of the children it named answers, its fallback searcher answers. A
 * dispatcher's children may be dispatchers, so trees nest.
 *
 * Every node gets the same context, so any node can be run, measured, and
 * tuned on its own: `runTree` takes an optional `tuning` with weights that
 * replace a node's shipped weights for one call, and a trace callback that
 * sees every step. Neither ever reaches a command's output.
 *
 * @input a tree of nodes, a request, and the context the command's adapter
 *   gathered
 * @output the first answer a searcher gives
 * @position foundation; api/build and api/search build their trees with it
 */

/**
 * @template Request, Context, Answer
 * @typedef {object} Searcher
 * @property {'searcher'} kind
 * @property {string} id
 * @property {string} summary One plain line: what it answers.
 * @property {(request: Request, ctx: Context, weights: unknown) => Answer | null | Promise<Answer | null>} run
 *   `weights` is a tuning override for this node, or null for its shipped weights.
 */

/**
 * @typedef {object} Route
 * @property {readonly string[]} ids The children to try, best first.
 * @property {number} confidence From 0 to 1.
 */

/**
 * @template Request, Context
 * @typedef {object} Dispatcher
 * @property {'dispatcher'} kind
 * @property {string} id
 * @property {string} summary
 * @property {readonly string[]} children
 * @property {number} floor Below this confidence the fallback answers.
 * @property {string} fallback A searcher's id.
 * @property {(request: Request, ctx: Context, weights: unknown) => Route | Promise<Route>} route
 */

/**
 * @template Request, Context, Answer
 * @typedef {Searcher<Request, Context, Answer> | Dispatcher<Request, Context>} TreeNode
 */

/**
 * @template Request, Context, Answer
 * @typedef {object} Tree
 * @property {string} root
 * @property {ReadonlyMap<string, TreeNode<Request, Context, Answer>>} nodes
 */

/**
 * One step the runner took.
 * @typedef {object} TraceStep
 * @property {string} id
 * @property {'searcher' | 'dispatcher'} kind
 * @property {number} depth
 * @property {boolean} fallback Whether this step ran as a fallback.
 * @property {Route} [route] A dispatcher's route.
 * @property {boolean} [answered] Whether a searcher answered.
 */

/**
 * @typedef {object} Tuning
 * @property {Readonly<Record<string, unknown>>} [weights] Weights by node id, replacing that node's shipped weights for this call.
 * @property {(step: TraceStep) => void} [onTrace]
 */

/**
 * @template Request, Context, Answer
 * @param {Omit<Searcher<Request, Context, Answer>, 'kind'>} node
 * @returns {Searcher<Request, Context, Answer>}
 */
export function defineSearcher(node) {
  return Object.freeze({...node, kind: /** @type {const} */ ('searcher')});
}

/**
 * @template Request, Context
 * @param {Omit<Dispatcher<Request, Context>, 'kind'>} node
 * @returns {Dispatcher<Request, Context>}
 */
export function defineDispatcher(node) {
  return Object.freeze({...node, kind: /** @type {const} */ ('dispatcher')});
}

/**
 * A tree from its nodes. Throws on a duplicate id, a missing root, child, or
 * fallback, a fallback that is not a searcher, or a dispatcher cycle.
 * @template Request, Context, Answer
 * @param {string} root
 * @param {readonly TreeNode<Request, Context, Answer>[]} list
 * @returns {Tree<Request, Context, Answer>}
 */
export function defineTree(root, list) {
  /** @type {Map<string, TreeNode<Request, Context, Answer>>} */
  const nodes = new Map();
  for (const node of list) {
    if (nodes.has(node.id)) throw new Error(`duplicate node "${node.id}"`);
    nodes.set(node.id, node);
  }
  if (!nodes.has(root)) throw new Error(`no root node "${root}"`);
  for (const node of nodes.values()) {
    if (node.kind !== 'dispatcher') continue;
    for (const id of [...node.children, node.fallback]) {
      if (!nodes.has(id)) {
        throw new Error(`"${node.id}" names a missing node "${id}"`);
      }
    }
    if (nodes.get(node.fallback)?.kind !== 'searcher') {
      throw new Error(
        `"${node.id}" falls back to "${node.fallback}", which is not a searcher`,
      );
    }
  }
  /** @param {string} id @param {string[]} path */
  const visit = (id, path) => {
    if (path.includes(id)) {
      throw new Error(`dispatcher cycle ${[...path, id].join(' -> ')}`);
    }
    const node = nodes.get(id);
    if (node?.kind === 'dispatcher') {
      for (const child of node.children) visit(child, [...path, id]);
    }
  };
  visit(root, []);
  return Object.freeze({root, nodes});
}

/**
 * Runs the tree from its root, or from `start` to run one node alone: a
 * dispatcher below its floor runs its fallback; otherwise the children it
 * names run in order and the first answer wins; when none answers, the
 * fallback runs.
 * @template Request, Context, Answer
 * @param {Tree<Request, Context, Answer>} tree
 * @param {Request} request
 * @param {Context} ctx
 * @param {{tuning?: Tuning, start?: string}} [options]
 * @returns {Promise<Answer | null>}
 */
export async function runTree(tree, request, ctx, options = {}) {
  const start = options.start ?? tree.root;
  if (!tree.nodes.has(start)) throw new Error(`no node "${start}"`);
  return runNode(tree, start, request, ctx, options.tuning, 0, false);
}

/**
 * @template Request, Context, Answer
 * @param {Tree<Request, Context, Answer>} tree
 * @param {string} id
 * @param {Request} request
 * @param {Context} ctx
 * @param {Tuning | undefined} tuning
 * @param {number} depth
 * @param {boolean} fallback
 * @returns {Promise<Answer | null>}
 */
async function runNode(tree, id, request, ctx, tuning, depth, fallback) {
  const node = /** @type {TreeNode<Request, Context, Answer>} */ (
    tree.nodes.get(id)
  );
  const weights =
    tuning?.weights && Object.hasOwn(tuning.weights, id)
      ? tuning.weights[id]
      : null;
  if (node.kind === 'searcher') {
    const answer = (await node.run(request, ctx, weights)) ?? null;
    tuning?.onTrace?.({
      id,
      kind: 'searcher',
      depth,
      fallback,
      answered: answer !== null,
    });
    return answer;
  }
  const route = await node.route(request, ctx, weights);
  for (const child of route.ids) {
    if (!node.children.includes(child)) {
      throw new Error(
        `"${id}" routed to "${child}", which is not one of its children`,
      );
    }
  }
  tuning?.onTrace?.({
    id,
    kind: 'dispatcher',
    depth,
    fallback,
    route: {ids: [...route.ids], confidence: route.confidence},
  });
  if (route.confidence >= node.floor) {
    for (const child of route.ids) {
      const answer = await runNode(
        tree,
        child,
        request,
        ctx,
        tuning,
        depth + 1,
        false,
      );
      if (answer !== null) return answer;
    }
  }
  return runNode(tree, node.fallback, request, ctx, tuning, depth + 1, true);
}
