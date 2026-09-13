/**
 * One small dataset written three ways, so switching examples shows the same
 * records rather than three unrelated snippets. It deliberately contains the
 * awkward cases: nested objects, a ragged array of primitives, a null, a
 * boolean, a float and a string that would be ruined by number coercion.
 */

import type { DataFormat } from './types';

const JSON_EXAMPLE = `[
  {
    "id": 1,
    "name": "Ada Lovelace",
    "active": true,
    "score": 99.5,
    "address": { "city": "London", "postcode": "W1J 9BW" },
    "tags": ["maths", "engines"],
    "manager": null
  },
  {
    "id": 2,
    "name": "Grace Hopper",
    "active": false,
    "score": 98,
    "address": { "city": "New York", "postcode": "NY 10001" },
    "tags": ["compilers"],
    "manager": "Ada Lovelace"
  }
]`;

const CSV_EXAMPLE = [
  'id,name,active,score,address.city,address.postcode,tags.0,tags.1,manager',
  '1,Ada Lovelace,true,99.5,London,W1J 9BW,maths,engines,null',
  '2,Grace Hopper,false,98,New York,NY 10001,compilers,,Ada Lovelace',
].join('\n');

const YAML_EXAMPLE = `- id: 1
  name: Ada Lovelace
  active: true
  score: 99.5
  address:
    city: London
    postcode: W1J 9BW
  tags:
    - maths
    - engines
  manager: null
- id: 2
  name: Grace Hopper
  active: false
  score: 98
  address:
    city: New York
    postcode: NY 10001
  tags:
    - compilers
  manager: Ada Lovelace`;

export const EXAMPLES: Record<DataFormat, string> = {
  json: JSON_EXAMPLE,
  csv: CSV_EXAMPLE,
  yaml: YAML_EXAMPLE,
};
