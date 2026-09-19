# Third-party licences

This site ships four large files that are not its own code: three pre-trained
models, and one command-line tool compiled to WebAssembly.

| File | What it does | Licence |
| --- | --- | --- |
| MODNet | Cuts a person out of a photo | Apache-2.0 |
| U²-Net (u2netp) | Cuts anything else out of a photo | Apache-2.0 |
| YuNet | Finds a face, for passport photos | MIT |
| qpdf | Takes the password off a PDF | Apache-2.0 |

None of the upstream projects distributes a `NOTICE` file, so clause 4(d) of the
Apache licence does not apply to any of them.

SecureKit itself remains [MIT](LICENSE). Both licences permit commercial use and
redistribution, and neither requires this project to change its own licence.

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

## YuNet (finding the face, for passport photos)

| | |
| --- | --- |
| Served as | `public/models/yunet-8f2383e4.onnx` |
| Size | 232,589 bytes |
| SHA-256 | `8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4` |
| Downloaded from | <https://huggingface.co/opencv/opencv_zoo/resolve/d4938dfc9d4ec5d098bfa33e98b3f3345a236586/models/face_detection_yunet/face_detection_yunet_2023mar.onnx> |
| Original project | <https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet> |
| Licence | MIT |
| Authors | Wei Wu, Wenbin Peng, Hanyang Peng and Shiqi Yu |

The OpenCV Zoo states that all files in that model's directory are under the MIT
licence. The file served here is the `2023mar` export, redistributed byte-for-byte,
pinned to the commit in the URL above. It takes a fixed 640 × 640 image and returns
a box and five landmarks per face. It never runs until someone picks a photo, and
it runs on the device — no photo, and nothing derived from one, is sent anywhere.

The MIT licence requires the copyright notice to travel with the file. The
[upstream licence](https://github.com/opencv/opencv_zoo/blob/main/models/face_detection_yunet/LICENSE)
is reproduced by this entry and its link.

## qpdf (taking the password off a PDF)

| | |
| --- | --- |
| Served as | `public/qpdf/qpdf-cbd81a24.wasm` |
| Size | 1,274,647 bytes |
| SHA-256 | `cbd81a244d622a39e3cf16f2e589a9a0d7cc51f588d35b3dd6b425a677cc3f99` |
| Copied from | `node_modules/@jspawn/qpdf-wasm/qpdf.wasm` |
| Package | <https://www.npmjs.com/package/@jspawn/qpdf-wasm> |
| Original project | <https://github.com/qpdf/qpdf> |
| Licence | Apache-2.0 |
| Author | Jay Berkenbilt |

qpdf is a command-line tool for transforming PDFs, compiled to WebAssembly by the
`@jspawn/qpdf-wasm` package, which is itself Apache-2.0. The `.wasm` file is
copied out of `node_modules` unmodified by `scripts/copy-qpdf.mjs`, which refuses
to write a file whose SHA-256 does not match the one above.

It is used for one job: `qpdf --decrypt --password=... in.pdf out.pdf`, run in the
browser, so a password-protected bank statement is opened on the device that owns
it rather than uploaded somewhere. The password is passed to qpdf inside the tab
and is never stored or sent.

qpdf releases before version 11 were under the Artistic Licence 2.0. The version
packaged here is Apache-2.0, matching the project's current licence.

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
- **InsightFace models (SCRFD, ArcFace)** — published for non-commercial research
  use, which is incompatible with this project.

None of these may be added, and none may be pulled in as a transitive dependency.

## Runtime

The three models are run by [onnxruntime-web](https://github.com/microsoft/onnxruntime),
which is MIT-licensed. Its runtime files are copied out of `node_modules` into
`public/ort/` at build time by `scripts/copy-onnx-runtime.mjs`, so nothing is ever
fetched from a CDN. The model files themselves are fetched once, at install time,
by `scripts/fetch-models.mjs`, which refuses to write a file whose SHA-256 does not
match.
