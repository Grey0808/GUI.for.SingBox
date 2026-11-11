// Headless Vue SFC/template testing. No DOM, Wails bootstrap or native bridge.
import { strict as assert } from 'node:assert'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import * as vue from 'vue'
import { parse, compileScript } from 'vue/compiler-sfc'

export async function loadSource(relative, modules, sfc = false) {
  const path = new URL(`../../src/${relative}`, import.meta.url)
  let source = await readFile(path, 'utf8')
  if (sfc)
    source = compileScript(parse(source, { filename: path.pathname }).descriptor, {
      id: relative,
      inlineTemplate: true,
      templateOptions: { compilerOptions: { hoistStatic: false } },
    }).content
  const exports = {}
  new Function(
    'require',
    'exports',
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
  )((name) => {
    if (name === 'vue') return vue
    assert.ok(Object.hasOwn(modules, name), `Unmocked import forbidden: ${name}`)
    return modules[name]
  }, exports)
  return sfc ? exports.default : exports
}

export const text = (node) => (node.text || '') + (node.children || []).map(text).join('')
export const findAll = (node, predicate) => [
  ...(predicate(node) ? [node] : []),
  ...(node.children || []).flatMap((child) => findAll(child, predicate)),
]
export async function flush() {
  for (let i = 0; i < 16; i++) await Promise.resolve()
  await vue.nextTick()
}
export async function click(node) {
  assert.ok(node, 'Control was not rendered')
  assert.ok(!node.props.disabled && !node.props['aria-disabled'], 'Control is disabled')
  await node.props.onClick?.({})
  await flush()
}
export async function input(node, value) {
  await (node.props.onInput || node.props.onChange)({ target: { value } })
  await flush()
}

const Button = vue.defineComponent({
  props: ['disabled', 'loading'],
  setup:
    (props, { slots }) =>
    () =>
      vue.h('button', { disabled: props.disabled || props.loading }, slots.default?.()),
})
export const controls = { Button }
for (const name of ['Input', 'CodeEditor', 'Select', 'Radio', 'Switch']) {
  controls[name] = vue.defineComponent({
    props: ['modelValue', 'options', 'disabled'],
    emits: ['update:modelValue'],
    setup:
      (props, { emit }) =>
      () =>
        vue.h(
          name === 'CodeEditor'
            ? 'textarea'
            : ['Select', 'Radio'].includes(name)
              ? 'select'
              : 'input',
          {
            value: props.modelValue,
            disabled: props.disabled,
            onInput: (event) => emit('update:modelValue', event.target.value),
          },
          props.options?.map((option) => vue.h('option', { value: option.value }, option.label)),
        ),
  })
}
for (const name of [
  'Card',
  'Divider',
  'Empty',
  'Icon',
  'ModalContainer',
  'CodeViewer',
  'KeyValueEditor',
]) {
  controls[name] = vue.defineComponent({
    setup:
      (_props, { slots }) =>
      () =>
        vue.h(
          name.toLowerCase(),
          {},
          Object.values(slots).flatMap((slot) => slot?.() || []),
        ),
  })
}

export function mount(Component, props = {}, provides = {}) {
  const element = (type, value = '') => ({
    type,
    text: value,
    props: {},
    style: {},
    children: [],
    parent: null,
  })
  const renderer = vue.createRenderer({
    createElement: (type) => element(type),
    createText: (value) => element('#text', value),
    createComment: (value) => element('#comment', value),
    setText: (node, value) => {
      node.text = value
    },
    setElementText: (node, value) => {
      node.text = value
      node.children = []
    },
    patchProp: (node, key, _before, value) => {
      node.props[key] = value
    },
    parentNode: (node) => node.parent,
    nextSibling: (node) => node.parent?.children[node.parent.children.indexOf(node) + 1] || null,
    insert(node, parent, anchor = null) {
      if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1)
      parent.children.splice(
        anchor ? parent.children.indexOf(anchor) : parent.children.length,
        0,
        node,
      )
      node.parent = parent
    },
    remove(node) {
      if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1)
      node.parent = null
    },
  })
  const root = element('root')
  const app = renderer.createApp(Component, props)
  const errors = []
  app.config.errorHandler = (error) => {
    errors.push(error)
  }
  app.config.warnHandler = (warning) => {
    errors.push(Error(warning))
  }
  for (const [name, component] of Object.entries(controls)) app.component(name, component)
  for (const name of ['draggable', 'menu', 'tips']) app.directive(name, {})
  for (const [key, value] of Object.entries(provides)) app.provide(key, value)
  const vm = app.mount(root)
  return {
    root,
    vm,
    errors,
    unmount: () => app.unmount(),
    buttons: (label) =>
      findAll(root, (node) => node.type === 'button' && text(node).trim() === label),
  }
}
