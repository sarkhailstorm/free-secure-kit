# Model licences

The background remover ships two pre-trained models. Both are licensed under the
**Apache License, Version 2.0** — <https://www.apache.org/licenses/LICENSE-2.0>.

Neither upstream project distributes a `NOTICE` file, so clause 4(d) of the licence
does not apply to either model.

SecureKit itself remains [MIT](LICENSE). Apache-2.0 permits commercial use and
redistribution, and does not require this project to change its own licence.

## MODNet (portrait cut-outs)

| | |
| --- | --- |
| Served as | `public/models/modnet-7bad6522.onnx` |
| Size | 6,627,048 bytes |
| SHA-256 | `7bad6522b3cde60246e69e234b7786337ef9c88abc790ee5c1aaa6e535b0c61d` |
| Downloaded from | <https://huggingface.co/Xenova/modnet/resolve/main/onnx/model_uint8.onnx> |
| Original project | <https://github.com/ZHKKKe/MODNet> |
| Licence | Apache-2.0 (<https://github.com/ZHKKKe/MODNet/blob/master/LICENSE>) |
| Authors | Zhanghan Ke, Jiayu Sun, Kaican Li, Qiong Yan and Rynson W. H. Lau |

The MODNet repository states that its licence covers the code, the models and the
demos. The file served here is a quantised export of that model, published in the
`Xenova/modnet` repository on Hugging Face under the same licence.

## U²-Net (u2netp — general cut-outs)

| | |
| --- | --- |
| Served as | `public/models/u2netp-309c8469.onnx` |
| Size | 4,574,861 bytes |
| SHA-256 | `309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8` |
| Downloaded from | <https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx> |
| Original project | <https://github.com/xuebinqin/U-2-Net> |
| Licence | Apache-2.0 (<https://github.com/xuebinqin/U-2-Net/blob/master/LICENSE>) |
| Authors | Xuebin Qin, Zichen Zhang, Chenyang Huang, Masood Dehghan, Osmar R. Zaiane and Martin Jagersand |

`u2netp` is the small variant of U²-Net. The file served here is the export
redistributed by the `rembg` project.

## What Apache-2.0 asks of this repository

Clause 4 of the licence applies to anyone redistributing these files. In full, a
redistribution must:

- **(a)** give every recipient a copy of the licence;
- **(b)** carry prominent notices stating that the files were changed, if they were;
- **(c)** retain, in the source form of any derivative work, all copyright, patent,
  trademark and attribution notices from the source, excluding those that do not
  pertain to any part of the derivative work; and
- **(d)** include the contents of any `NOTICE` file distributed with the work,
  wherever such notices normally appear.

This file, together with the upstream links above, satisfies (a) and (c). The model
files are redistributed byte-for-byte and unmodified, so (b) does not apply. Neither
project ships a `NOTICE` file, so (d) does not apply.

## Models that are deliberately not used

- **BRIA RMBG-1.4 and RMBG-2.0** — CC BY-NC. Non-commercial only, which is
  incompatible with this project.
- **`@imgly/background-removal`** — AGPL-3.0, which would force this repository to
  relicense.

Neither may be added, and neither may be pulled in as a transitive dependency.

## Runtime

Both models are run by [onnxruntime-web](https://github.com/microsoft/onnxruntime),
which is MIT-licensed. Its runtime files are copied out of `node_modules` into
`public/ort/` at build time by `scripts/copy-onnx-runtime.mjs`, so nothing is ever
fetched from a CDN.
