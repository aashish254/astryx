// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @type {import('@astryxdesign/cli/authoring').ComponentAnatomyElement[]} */

const anatomy = [
  {
    name: 'Shared dialog',
    required: true,
    description:
      'One native dialog that owns modality, focus, dismissal, and lifecycle for the complete flow.',
  },
  {
    name: 'Sheet panels',
    required: true,
    description:
      'Direct BottomSheet children; exactly one is interactive while a previous panel may remain visible and inert during a handoff.',
  },
  {
    name: 'Scrim',
    required: false,
    description:
      'Native dialog backdrop shown by the default scrim-backed modal presentation.',
  },
];

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docs = {
  name: 'BottomSheetSwitcher',
  displayName: 'Bottom Sheet Switcher',
  group: 'BottomSheet',
  category: 'Overlay',
  keywords: ['bottom sheet', 'switcher', 'multi-step', 'flow', 'wizard'],
  playground: {
    overlay: true,
    overlayControl: {
      stateProp: 'activeSheet',
      openValue: 'details',
    },
    defaults: {
      activeSheet: null,
      children: [
        {
          __element: 'BottomSheet',
          props: {
            sheetId: 'details',
            label: 'Setup details',
            height: 'hug',
          },
          children: {
            __element: 'Section',
            props: {padding: 4},
            children: {
              __element: 'VStack',
              props: {gap: 2},
              children: [
                {
                  __element: 'Heading',
                  props: {level: 3},
                  children: 'Setup details',
                },
                {
                  __element: 'Text',
                  props: {type: 'body'},
                  children: 'Add the essential information for this setup.',
                },
                {
                  __element: 'Text',
                  props: {type: 'supporting'},
                  children: 'You can review these details before saving.',
                },
              ],
            },
          },
        },
        {
          __element: 'BottomSheet',
          props: {
            sheetId: 'preferences',
            label: 'Choose preferences',
            height: 'hug',
          },
          children: {
            __element: 'Section',
            props: {padding: 4},
            children: {
              __element: 'VStack',
              props: {gap: 2},
              children: [
                {
                  __element: 'Heading',
                  props: {level: 3},
                  children: 'Choose preferences',
                },
                {
                  __element: 'Text',
                  props: {type: 'body'},
                  children: 'Select how this setup should behave.',
                },
                {
                  __element: 'Text',
                  props: {type: 'supporting'},
                  children:
                    'Notifications can be sent immediately, daily, or weekly.',
                },
                {
                  __element: 'Text',
                  props: {type: 'supporting'},
                  children: 'You can update these preferences later.',
                },
              ],
            },
          },
        },
        {
          __element: 'BottomSheet',
          props: {
            sheetId: 'confirm',
            label: 'Confirm setup',
            height: 'hug',
          },
          children: {
            __element: 'Section',
            props: {padding: 4},
            children: {
              __element: 'VStack',
              props: {gap: 2},
              children: [
                {
                  __element: 'Heading',
                  props: {level: 3},
                  children: 'Confirm setup',
                },
                {
                  __element: 'Text',
                  props: {type: 'body'},
                  children: 'Everything is ready to save.',
                },
              ],
            },
          },
        },
      ],
    },
  },
  description:
    'Deprecated: write each step as its own BottomSheet with isOpen, controlled by one state value that names the open step. Closing the top sheet and opening the next in the same update runs the same replace handoff (see BottomSheet, Replacing a sheet), with no sheetId and no switcher. BottomSheetSwitcher keeps working until a future minor release removes it: a flow used on its own behaves as released, and a flow stacked with other sheets is one level of the stack (it recedes and is blocked when covered, shares the one scrim, and stands down from dismissal while covered). Modal and hasScrim={false} flows migrate the same way. Coordinates multiple BottomSheets as a mutually exclusive flow. One activeSheet ID selects the only interactive sheet; during a handoff, the new sheet enters above the inert previous sheet. If the new sheet is shorter, the previous sheet simultaneously moves down until their top edges align, then fades after both transforms complete. The switcher owns one shared native <dialog>: modal flows call showModal() once for one top-layer boundary and one ::backdrop across the whole flow, while no-scrim flows use a non-modal show() shell. Its ref and shared DOM props target that dialog.',
  props: [
    {
      name: 'ref',
      type: 'Ref<HTMLDialogElement>',
      description: 'Ref forwarded to the one shared native dialog.',
    },
    {
      name: 'onCancel',
      type: '(event: SyntheticEvent<HTMLDialogElement>) => void',
      description:
        'Called before the switcher handles a native dialog cancel request. Calling preventDefault() keeps the controlled flow open.',
    },
    {
      name: 'activeSheet',
      type: 'string | null',
      description:
        "ID of the interactive BottomSheet, or null when the flow should close. Match a nested BottomSheet's unique sheetId; the previous sheet may remain visually present and inert while the new sheet enters, simultaneously align downward behind a shorter step, then fade away.",
      required: true,
    },
    {
      name: 'onActiveSheetChange',
      type: '(activeSheet: string | null) => void',
      description:
        "Called with null when the active sheet dismisses according to its purpose. Child BottomSheets may use purpose='form' or purpose='required' to limit implicit dismissal while flow controls can still use the same state setter to switch sheets or close the flow.",
      required: true,
    },
    {
      name: 'hasScrim',
      type: 'boolean',
      description:
        "Whether the shared dialog is modal. true uses showModal() once for one native ::backdrop, focus trap, scroll lock, and click-to-dismiss when the active BottomSheet has purpose='info'. false uses show() with no backdrop and leaves the page interactive; avoid transformed, contained, or clipping ancestors because the non-modal dialog remains in its containing context.",
      default: 'true',
    },
    {
      name: 'children',
      type: 'ReactNode',
      description: 'BottomSheets identified by unique sheetId values.',
      required: true,
    },
  ],
  usage: {
    anatomy,
    description:
      "Deprecated: write each step as its own BottomSheet with isOpen, controlled by one state value that names the open step. Closing the top sheet and opening the next in the same update runs the same replace handoff (see BottomSheet, Replacing a sheet), with no sheetId and no switcher. BottomSheetSwitcher keeps working until a future minor release removes it: a flow used on its own behaves as released, and a flow stacked with other sheets is one level of the stack (it recedes and is blocked when covered, shares the one scrim, and stands down from dismissal while covered). Modal and hasScrim={false} flows migrate the same way. Set activeSheet to a nested BottomSheet's sheetId to open or switch steps, and to null to close.\n\nStacking. A scrim flow is one level in the stack of open sheets (see BottomSheet, Stacking). Open it while a standalone sheet is open and the flow sits on top of that sheet, which recedes and is blocked; open a standalone sheet while the flow is open, from a step's content or from anywhere else, and that sheet sits on top while the whole flow recedes as one. Switching the step in place never changes the flow's position. Escape, the scrim, a swipe, and a platform close request reach only the top level: the flow's onActiveSheetChange(null) when the flow is on top, the standalone sheet's onOpenChange(false) when that sheet is. A standalone sheet rendered inside a step's content is presented only while that step is the active one: it leaves when the flow switches step or closes, its isOpen stays yours, and it is presented again, on top, if the step returns while it is still open. Only the bottom level's backdrop dims the page. A no-scrim flow stays out of the stack.",
    bestPractices: [
      {
        guidance: true,
        description:
          'Prefer one standalone BottomSheet per step with one state value naming the open step; the replace handoff is the same and nothing has to be nested under a switcher.',
      },
      {
        guidance: true,
        description:
          'Migrate an existing flow in place: replace activeSheet / onActiveSheetChange with one step value, give each step isOpen={step === id} and a guarded onOpenChange (clear the step only if it is still the open one) in place of sheetId, remove the wrapper and move its hasScrim onto every step.',
      },
      {
        guidance: false,
        description:
          "Don't split information across sheets when people need to compare it; use a full-page layout that keeps the relevant content visible together instead.",
      },
      {
        guidance: false,
        description:
          "Don't use a step flow when multiple panels must stay interactive or visible together; a flow intentionally selects one interactive step.",
      },
    ],
  },
  examples: [
    {
      label: 'Replacement: the same three-step flow as standalone sheets',
      code: `const [step, setStep] = useState(null);

<>
  <Button label="Start" onClick={() => setStep('details')} />
  <BottomSheet isOpen={step === 'details'} onOpenChange={o => !o && setStep(c => (c === 'details' ? null : c))} label="Details" height="hug">
    <SetupDetails />
    <Button label="Continue" onClick={() => setStep('preferences')} />
  </BottomSheet>
  <BottomSheet isOpen={step === 'preferences'} onOpenChange={o => !o && setStep(c => (c === 'preferences' ? null : c))} label="Preferences" height="hug">
    <Preferences />
    <Button label="Back" onClick={() => setStep('details')} />
    <Button label="Continue" onClick={() => setStep('confirm')} />
  </BottomSheet>
  <BottomSheet isOpen={step === 'confirm'} onOpenChange={o => !o && setStep(c => (c === 'confirm' ? null : c))} label="Confirm" height="hug">
    <Confirmation />
    <Button label="Back" onClick={() => setStep('preferences')} />
    <Button label="Done" onClick={() => setStep(null)} />
  </BottomSheet>
</>`,
    },
  ],
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'deprecated: use one standalone BottomSheet per step with one state value naming the open step (same replace handoff, no sheetId); keeps working until a future minor removes it. controller with one shared native dialog for mutually exclusive multi-step BottomSheets; a scrim flow is one level of the bottom-sheet stack (stacks over or under standalone sheets in open order, recedes as a whole, switching steps keeps its place)',
  usage: {
    anatomy,
    description:
      "Deprecated: write each step as a standalone BottomSheet with isOpen driven by one state value; a same-update close and open is the same replace handoff. Still works: set activeSheet to a nested BottomSheet's sheetId to open or switch steps, and to null to close. A scrim flow stacks with standalone sheets as one level; a standalone sheet inside a step leaves when the step is left and returns with it while still open.",
    bestPractices: [
      {
        guidance: true,
        description:
          'Prefer one standalone BottomSheet per step with one state value naming the open step; the replace handoff is the same and nothing has to be nested under a switcher.',
      },
      {
        guidance: true,
        description:
          'Migrate an existing flow in place: replace activeSheet / onActiveSheetChange with one step value, give each step isOpen={step === id} and a guarded onOpenChange (clear the step only if it is still the open one) in place of sheetId, remove the wrapper and move its hasScrim onto every step.',
      },
      {
        guidance: false,
        description:
          "Don't split information across sheets when people need to compare it; use a full-page layout that keeps the relevant content visible together instead.",
      },
      {
        guidance: false,
        description:
          "Don't use a step flow when multiple panels must stay interactive or visible together; a flow intentionally selects one interactive step.",
      },
    ],
  },
};
