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

import { InternalSerializerType, Fury, Serializer } from "../type";

export default (fury: Fury, keySerializer: Serializer, valueSerializer: Serializer) => {
  const { binaryReader, binaryWriter, referenceResolver } = fury;
  const { varUInt32: readVarUInt32 } = binaryReader;

  const { varUInt32: writeVarUInt32, reserve: reserves } = binaryWriter;
  const { pushReadObject } = referenceResolver;
  const innerHeadSize = keySerializer.config().reserve + valueSerializer.config().reserve;
  return {
    ...referenceResolver.deref(() => {
      const len = readVarUInt32();
      const result = new Map();
      pushReadObject(result);
      for (let index = 0; index < len; index++) {
        const key = keySerializer.read();
        const value = valueSerializer.read();
        result.set(key, value);
      }
      return result;
    }),
    write: referenceResolver.withNullableOrRefWriter(InternalSerializerType.MAP, (v: Map<any, any>) => {
      const len = v.size;
      writeVarUInt32(len);
      reserves(innerHeadSize * v.size);
      for (const [key, value] of v.entries()) {
        keySerializer.write(key);
        valueSerializer.write(value);
      }
    }),
    config: () => {
      return {
        reserve: 7,
      };
    },
  };
};
