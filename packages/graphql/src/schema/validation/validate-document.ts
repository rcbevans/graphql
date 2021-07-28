/*
 * Copyright (c) "Neo4j"
 * Neo4j Sweden AB [http://neo4j.com]
 *
 * This file is part of Neo4j.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
    DefinitionNode,
    DocumentNode,
    GraphQLSchema,
    extendSchema,
    validateSchema,
    ObjectTypeDefinitionNode,
} from "graphql";
import * as scalars from "../scalars";
import * as enums from "./enums";
import * as directives from "./directives";
import * as point from "../point";

function filterDocument(document: DocumentNode) {
    const nodeNames = document.definitions
        .filter((definition) => {
            if (definition.kind === "ObjectTypeDefinition") {
                if (!["Query", "Mutation", "Subscription"].includes(definition.name.value)) {
                    return true;
                }
            }
            return false;
        })
        .map((definition) => (definition as ObjectTypeDefinitionNode).name.value);

    return {
        ...document,
        definitions: document.definitions.reduce((res: DefinitionNode[], def) => {
            if (def.kind !== "ObjectTypeDefinition" && def.kind !== "InterfaceTypeDefinition") {
                return [...res, def];
            }

            return [
                ...res,
                {
                    ...def,
                    directives: def.directives?.filter((x) => !["auth"].includes(x.name.value)),
                    fields: def.fields?.map((f) => ({
                        ...f,
                        arguments: f.arguments?.filter((argument) => {
                            const getArgumentType = (type) => {
                                if (["NonNullType", "ListType"].includes(type.kind)) {
                                    return getArgumentType(type.type);
                                }
                                return type.name.value;
                            };
                            const type = getArgumentType(argument.type);
                            const match = /(?<nodeName>.+)(?:CreateInput|Sort|UpdateInput|Where)/gm.exec(type);
                            if (match?.groups?.nodeName) {
                                if (nodeNames.includes(match.groups.nodeName)) {
                                    return false;
                                }
                            }
                            return true;
                        }),
                        directives: f.directives?.filter((x) => !["auth"].includes(x.name.value)),
                    })),
                },
            ];
        }, []),
    };
}

function validateDocument(document: DocumentNode): void {
    const doc = filterDocument(document);

    const schemaToExtend = new GraphQLSchema({
        directives: Object.values(directives),
        types: [...Object.values(scalars), ...Object.values(enums), ...Object.values(point)],
    });

    const schema = extendSchema(schemaToExtend, doc);

    const errors = validateSchema(schema);

    const filteredErrors = errors.filter((e) => e.message !== "Query root type must be provided.");

    if (filteredErrors.length) {
        throw new Error(filteredErrors.join("\n"));
    }
}

export default validateDocument;