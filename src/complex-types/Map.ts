/*
 * Copyright (c) AelasticS 2019.
 *
 */

import {
  appendPath,
  Error,
  Errors,
  failure,
  failures,
  isFailure,
  Path,
  success,
  validationError,
  Result
} from 'aelastics-result'
import { ComplexTypeC } from './ComplexType'
import {
  Any,
  ToDtoContext,
  DtoTypeOf,
  InstanceReference,
  TypeOf,
  FromDtoContext
} from '../common/Type'
import { TypeInstancePair, VisitedNodes } from '../common/VisitedNodes'
import { SimpleTypeC } from '../simple-types/SimpleType'
import { ExtraInfo, RoleType, TraversalContext } from '../common/TraversalContext'

/**
 * Map type
 */

// Converting ES6 Maps to and from JSON
// http://2ality.com/2015/08/es6-map-json.html

type DtoMapType<K extends Any, V extends Any> = {
  ref: InstanceReference
  map?: Array<[DtoTypeOf<K>, DtoTypeOf<V>]>
}

export class MapTypeC<K extends Any, V extends Any> extends ComplexTypeC<
  V,
  Map<TypeOf<K>, TypeOf<V>>,
  DtoMapType<K, V>,
  Array<[DtoTypeOf<K>, DtoTypeOf<V>]>
> {
  public readonly _tag: 'Map' = 'Map'
  public readonly keyType: K

  constructor(name: string, type: V, k: K) {
    super(name, type)
    this.keyType = k
  }

  public defaultValue(): any {
    return new Map()
  }

  makeEmptyInstance(
    value: Array<[DtoTypeOf<K>, DtoTypeOf<V>]> | DtoMapType<K, V>,
    path: Path,
    context: FromDtoContext
  ): Map<TypeOf<K>, TypeOf<V>> {
    return new Map()
  }

  //  https://github.com/redux-saga/redux-saga/issues/306

  protected *children(
    value: Map<TypeOf<K>, TypeOf<V>>
  ): Generator<[Any, any, RoleType, ExtraInfo]> {
    let arr = Array.from(value.entries())
    for (let a of arr) {
      yield [this.baseType, a[0], 'asMapKey', {}]
      yield [this.baseType, a[1], 'asMapValue', {}]
    }
  }

  validateCyclic(
    input: Map<TypeOf<K>, TypeOf<V>>,
    path: Path = [],
    traversed: VisitedNodes<Any, any, any>
  ): Result<boolean> {
    if (!(input instanceof Map)) {
      return failure(new Error(`Value ${path}: '${input}' is not valid Map`))
    }
    let pair: TypeInstancePair<Any, any> = [this, input]
    if (traversed.has(pair)) {
      return success(true)
    }

    traversed.set(pair, undefined)

    const errors: Errors = []

    input.forEach((value: V, key: K) => {
      let res = this.baseType.validateCyclic(
        value,
        appendPath(path, `[${key}]`, value.name),
        traversed
      )
      if (isFailure(res)) {
        errors.push(...res.errors)
      }

      res = this.keyType.validateCyclic(key, appendPath(path, `[${key}]`, key.name), traversed)
      if (isFailure(res)) {
        errors.push(...res.errors)
      }
    })

    const res = this.checkValidators(input, path)
    if (isFailure(res)) {
      errors.push(...res.errors)
    }
    return errors.length ? failures(errors) : success(true)
  }

  protected isMapRef(input: any): input is DtoMapType<K, V> {
    if (input.ref && input.map) {
      return true
    }
    return false
  }

  makeInstanceFromDTO(
    input: Array<[DtoTypeOf<K>, DtoTypeOf<V>]>,
    output: Map<K, TypeOf<V>>,
    path: Path,
    context: FromDtoContext
  ): Map<TypeOf<K>, TypeOf<V>> {
    if (!Array.isArray(input)) {
      context.errors.push(
        validationError('Input is not a map represented as an array', path, this.name, input)
      )
      return new Map<TypeOf<K>, TypeOf<V>>()
    }
    for (let i = 0; i < input.length; i++) {
      let newPath = appendPath(path, `[${i}]`, this.name)
      if (input[i].length !== 2) {
        context.errors.push(validationError('Invalid map element', newPath, this.name))
        continue
      }
      const k: K = input[i][0]
      const keyConversion = this.keyType.fromDTOCyclic(k, newPath, context)
      const x: V = input[i][1]
      const valueConversion = this.baseType.fromDTOCyclic(x, newPath, context)
      output.set(keyConversion, valueConversion)
    }
    return output
  }

  makeDTOInstance(
    input: Map<TypeOf<K>, TypeOf<V>>,
    ref: InstanceReference,
    path: Path,
    context: ToDtoContext
  ): Array<[DtoTypeOf<K>, DtoTypeOf<V>]> {
    const outputMapArray: Array<[DtoTypeOf<K>, DtoTypeOf<V>]> = []
    for (const [k, v] of input.entries()) {
      const kConversion = this.keyType.toDTOCyclic(
        k,
        appendPath(path, `[${k}]`, this.name),
        context
      )
      const vConversion = this.baseType.toDTOCyclic(
        v,
        appendPath(path, `[${v}]`, this.name),
        context
      )
      outputMapArray.push([k, v])
    }
    return outputMapArray
  }

  validateLinks(traversed: Map<Any, Any>): Result<boolean> {
    traversed.set(this, this)
    let errors = []
    if (!traversed.has(this.baseType)) {
      let res = this.baseType.validateLinks(traversed)
      if (isFailure(res)) {
        errors.push(...res.errors)
      }
    }
    if (!traversed.has(this.keyType)) {
      let res2 = this.keyType.validateLinks(traversed)
      if (isFailure(res2)) {
        errors.push(...res2.errors)
      }
    }
    return errors.length ? failures(errors) : success(true)
  }
}

export const mapOf = <K extends Any, V extends Any>(
  key: K,
  element: V,
  name: string = `MapOf<${element.name}>`
): MapTypeC<K, V> => {
  return new MapTypeC<K, V>(name, element, key)
}
