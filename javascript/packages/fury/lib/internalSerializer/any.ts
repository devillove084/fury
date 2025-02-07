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

import { Fury, MaxInt32, MinInt32, Serializer } from "../type";
import { InternalSerializerType, RefFlags } from "../type";

export default (fury: Fury) => {
  const { binaryReader, binaryWriter, referenceResolver, classResolver } = fury;

  function detectSerializer(cursor: number) {
    const typeId = binaryReader.int16();
    let serializer: Serializer;
    if (typeId === InternalSerializerType.FURY_TYPE_TAG) {
      serializer = classResolver.getSerializerByTag(classResolver.detectTag(binaryReader));
    } else {
      serializer = classResolver.getSerializerById(typeId);
    }
    if (!serializer) {
      throw new Error(`cant find implements of typeId: ${typeId}`);
    }
    binaryReader.setCursor(cursor);

    return serializer;
  }

  return {
    read: () => {
      const cursor = binaryReader.getCursor();
      const flag = referenceResolver.readRefFlag();
      switch (flag) {
        case RefFlags.RefValueFlag:
          return detectSerializer(cursor).read();
        case RefFlags.RefFlag:
          return referenceResolver.getReadObjectByRefId(binaryReader.varUInt32());
        case RefFlags.NullFlag:
          return null;
        case RefFlags.NotNullValueFlag:
          return detectSerializer(cursor).read();
      }
    },
    write: (v: any) => {
      const { write: writeInt64, config: int64Config } = classResolver.getSerializerById(InternalSerializerType.INT64);
      const { write: writeDouble, config: doubleConfig } = classResolver.getSerializerById(InternalSerializerType.DOUBLE);
      const { write: writeInt32, config: int32Config } = classResolver.getSerializerById(InternalSerializerType.INT32);
      const { write: writeBool, config: boolConfig } = classResolver.getSerializerById(InternalSerializerType.BOOL);
      const { write: stringWrite, config: stringConfig } = classResolver.getSerializerById(InternalSerializerType.STRING);
      const { write: arrayWrite, config: arrayConfig } = classResolver.getSerializerById(InternalSerializerType.ARRAY);
      const { write: mapWrite, config: mapConfig } = classResolver.getSerializerById(InternalSerializerType.MAP);
      const { write: setWrite, config: setConfig } = classResolver.getSerializerById(InternalSerializerType.FURY_SET);
      const { write: timestampWrite, config: timestampConfig } = classResolver.getSerializerById(InternalSerializerType.TIMESTAMP);

      // NullFlag
      if (v === null || v === undefined) {
        binaryWriter.reserve(1);
        binaryWriter.int8(RefFlags.NullFlag); // null
        return;
      }

      // NotNullValueFlag
      if (typeof v === "number") {
        if (Number.isNaN(v) || !Number.isFinite(v)) {
          binaryWriter.reserve(1);
          binaryWriter.int8(RefFlags.NullFlag); // null
          return;
        }
        if (Number.isInteger(v)) {
          if (v > MaxInt32 || v < MinInt32) {
            binaryWriter.reserve(int64Config().reserve);
            writeInt64(BigInt(v));
            return;
          } else {
            binaryWriter.reserve(int32Config().reserve);
            writeInt32(v);
            return;
          }
        } else {
          binaryWriter.reserve(doubleConfig().reserve);
          writeDouble(v);
          return;
        }
      }

      if (typeof v === "bigint") {
        binaryWriter.reserve(int64Config().reserve);
        writeInt64(v);
        return;
      }

      if (typeof v === "boolean") {
        binaryWriter.reserve(boolConfig().reserve);
        writeBool(v);
        return;
      }

      if (v instanceof Date) {
        binaryWriter.reserve(timestampConfig().reserve);
        timestampWrite(v);
        return;
      }

      if (typeof v === "string") {
        binaryWriter.reserve(stringConfig().reserve);
        stringWrite(v);
        return;
      }

      if (v instanceof Map) {
        binaryWriter.reserve(5);
        binaryWriter.reserve(mapConfig().reserve);
        mapWrite(v);
        return;
      }
      if (v instanceof Set) {
        binaryWriter.reserve(setConfig().reserve);
        setWrite(v);
        return;
      }
      if (Array.isArray(v)) {
        binaryWriter.reserve(arrayConfig().reserve);
        arrayWrite(v);
        return;
      }

      throw new Error(`serializer not support ${typeof v} yet`);
    },
    config: () => {
      return {
        reserve: 11,
      };
    },
  };
};
