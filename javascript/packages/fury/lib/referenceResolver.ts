/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import {
  RefFlags,
  BinaryReader,
  BinaryWriter,
  SerializerRead,
  InternalSerializerType,
  SerializerWrite,
} from "./type";
import type ClassResolver from "./classResolver";

export const makeHead = (flag: RefFlags, type: InternalSerializerType) => {
  return (((type << 16) >>> 16) << 8) | ((flag << 24) >>> 24);
};

export const ReferenceResolver = (
  config: {
    refTracking?: boolean
  },
  binaryWriter: BinaryWriter,
  binaryReader: BinaryReader,
  classResolver: ClassResolver
) => {
  let readObjects: any[] = [];
  let writeObjects: any[] = [];

  function reset() {
    readObjects = [];
    writeObjects = [];
  }

  function getReadObjectByRefId(refId: number) {
    return readObjects[refId];
  }

  function readRefFlag() {
    return binaryReader.int8() as RefFlags;
  }

  function pushReadObject(object: any) {
    readObjects.push(object);
  }

  function pushWriteObject(object: any) {
    writeObjects.push(object);
  }

  function existsWriteObject(obj: any) {
    for (let index = 0; index < writeObjects.length; index++) {
      if (writeObjects[index] === obj) {
        return index;
      }
    }
  }

  function skipType() {
    const typeId = binaryReader.int16();
    if (typeId === InternalSerializerType.FURY_TYPE_TAG) {
      classResolver.readTag(binaryReader);
    }
  }

  function withNullableOrRefWriter<T>(
    type: InternalSerializerType,
    fn: SerializerWrite<T>
  ) {
    const int24 = binaryWriter.int24;
    const head = makeHead(RefFlags.RefValueFlag, type);
    if (config.refTracking) {
      return (v: T) => {
        if (v !== null && v !== undefined) {
          const existsId = existsWriteObject(v);
          if (typeof existsId === "number") {
            binaryWriter.int8(RefFlags.RefFlag);
            binaryWriter.varUInt32(existsId);
          } else {
            int24(head);
            pushWriteObject(v);
            fn(v);
          }
        } else {
          binaryWriter.int8(RefFlags.NullFlag);
        }
      };
    } else {
      return (v: T) => {
        if (v !== null && v !== undefined) {
          int24(head);
          fn(v);
        } else {
          binaryWriter.int8(RefFlags.NullFlag);
        }
      };
    }
  }

  function withNotNullableWriter<T>(
    type: InternalSerializerType,
    defaultValue: T,
    fn: SerializerWrite<T>
  ) {
    const head = makeHead(RefFlags.NotNullValueFlag, type);
    const int24 = binaryWriter.int24;
    return (v: T) => {
      int24(head);
      if (v == null || v == undefined) {
        fn(defaultValue);
      } else {
        fn(v);
      }
    };
  }

  function deref<T>(fn: SerializerRead<T>) {
    return {
      read: () => {
        switch (readRefFlag()) {
          case RefFlags.RefValueFlag:
            skipType();
            return fn();
          case RefFlags.RefFlag:
            return getReadObjectByRefId(binaryReader.varUInt32());
          case RefFlags.NullFlag:
            return null;
          case RefFlags.NotNullValueFlag:
            skipType();
            return fn();
        }
      },
      readWithoutType: () => {
        switch (readRefFlag()) {
          case RefFlags.RefValueFlag:
            return fn();
          case RefFlags.RefFlag:
            return getReadObjectByRefId(binaryReader.varUInt32());
          case RefFlags.NullFlag:
            return null;
          case RefFlags.NotNullValueFlag:
            return fn();
        }
      },
    };
  }

  return {
    existsWriteObject,
    pushWriteObject,
    pushReadObject,
    readRefFlag,
    getReadObjectByRefId,
    reset,
    withNotNullableWriter,
    withNullableOrRefWriter,
    deref,
  };
};
