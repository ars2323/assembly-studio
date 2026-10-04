# CPU/ — origin

**The SPIM sources in this directory are not modified.**

This is the simulator core of SPIM/QtSpim 9.1.24 by James R. Larus, BSD license,
from SPIM's Subversion repository at SourceForge, revision r764
(https://sourceforge.net/projects/spimsimulator/). The 28 files below are upstream's, byte for byte. This file,
`ORIGIN.md`, is the only one this project added.

SPIM's license is in its README, kept verbatim in `electron/licenses/SPIM-README.txt` and quoted in `NOTICE` (§1).

The program builds the core through `electron/native/binding.gyp` (as `../../CPU`). Everything the program needs
from it is done outside it: the core's functions are wrapped in `electron/native/src/addon.cc`, or a file is
compiled through a wrapper (`electron/native/src/run-win.cpp`, Windows only), and these files stay as they are.

## SHA-256 of the files (r764)

To check that they are still upstream's: `sha256sum CPU/* | grep -v ORIGIN.md` must print exactly these lines.

```
7092e8c41237fa1f4fb3cf5bba0335d9d51d9f6c9fcd308e895846df1f0e36d4  CPU/data.cpp
1c091658c6dc54729d0b560f706512d73b9a879b831f5184afd1d5950d784746  CPU/data.h
15e7a15c0974d3f3430aece7b6078a073d19d872a5e32e84a7982783fca67cc6  CPU/display-utils.cpp
2d9a7415b02cb9d86f2934cbcd9e3151591cb141e332bf294c455c4dd3da2a11  CPU/dump_ops.cpp
44c91ad0364e42856b132906fa046e1fbfed2b2fdb8ea927bf03f3e2e1fe52a5  CPU/exceptions.s
fb86c77ca640989190293050d61d90b0bde0ebfaa2479f24be2efcbeb5116a9b  CPU/inst.cpp
6c094d323d673d18a7d06c29e8db8945a33fe7763c7f1042042db218e45a2a4b  CPU/inst.h
3eb66cf9d2631d1bc831419dbdaccad04c6984e6926ee540cc1f9f7a655c85b8  CPU/mem.cpp
2ac73c69abc77804739e461c1dfcac50e9a9b10c81066522e7f732a77ab51ee0  CPU/mem.h
69c1436e163900c9d87105dfa4d8f5e557f228ea112c7133f7a66b111b6ea47e  CPU/op.h
49751478d842c845976131eb4e1b70643daa03efd8a8b3763ce5b5baa7a48d99  CPU/parser.h
f576c4d31600294fd8698878b56e94f53043b8ed90e97040ee1c55b35f7e18ca  CPU/parser.y
2558272e59700eade3ca42fcbed73b304bda44e8b8d9e5e6ee9c6562cc21b55a  CPU/reg.h
c71e719237f7ab0a59abdb0690617b2b68a777f8629cf8710c0685760211e436  CPU/run.cpp
d2054494eb5661972c5c41306992449c1e3031353737d48193bf2885b05be1a6  CPU/run.h
ab70c07f8a8d21b89b7fdf8e507e05496ec7bad4fef86afe1609dd8a281adbab  CPU/scanner.h
e4b1452ce9d61897814af4074c23b15409907b7cb9413a81f25570970bb073a3  CPU/scanner.l
cc6e4cb8a091c8263641b8d67407db7a454901ca646a44b6d5cc3fbcc1826721  CPU/spim-syscall.h
fb6dcede1cef43346abefc1309f74c394116725bd11b1403536e5214ccd7bca8  CPU/spim-utils.cpp
f8150e35c4d37853bfdb26235240e7abf8dcab18d2b15d962d206c857b54da01  CPU/spim-utils.h
dbc598ca41a1324384a6e5452c15618600997c7849843cfed865ee1ffb748928  CPU/spim.h
4603c085426c55075c116c8d76978744cf17a83f64449012f46e9de0884c1723  CPU/string-stream.cpp
ad1a76c5b29d749296d7bba80f6389e78356d20464fbb201713c7e6f2b3482f6  CPU/string-stream.h
5fafa17296a7a962ddef54ec9c5cc62aa15a27b0cc240ecf847b94fc5a13358e  CPU/sym-tbl.cpp
4ca1d76fcb31e64406182c562881bc3e89367839e402373eb064636ff6fd5e29  CPU/sym-tbl.h
ebe0a49b3911d0a2891d0bc4f03b00bb61b7bad9dd0603ee29a4e806f53475b6  CPU/syscall.cpp
8033619c536f1024881988c74ed36eb1497c8d4d8c96f392ed4647b634e18dc5  CPU/syscall.h
754d808b1e8d10fd0a0ae19230a22235b12a93fa13d4036bc4587ebe01377c4b  CPU/version.h
```
