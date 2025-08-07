## Introducción
En este challenge se desarrolló un contrato WrapperFactory que permite desplegar instancias del contrato WrapperERC20, que funcionan para cualquier token ERC20 existente. La WrapperFactory está diseñada como un proxy utilizando el estándar ERC1967 .

##### Funcionalidad de WrapperFactory
Está configurada como un contrato proxy, este tiene los roles definidos con sus jerarquías de permisos y sus respectivas funciones de set.

Implementa la función deployWrappedToken, que permite desplegar nuevos contratos WrapperERC20 como proxies individuales. Todos estos proxies apuntan a una única implementación compartida de WrapperERC20.

Funciones de para cambiar el feeReceiver y el depósitFee con sus respectivas access control.

#### Funcionalidad del WrapperERC20
Este contrato tiene que objetivo poder mintear un token WrapperERC20 1:1 entregando su respectivo token subyasente y que lo pueda retirar entregando WrapperERC20 para este luego quemarse.
- deposit: permite al usuario depositar el token subyacente y recibir el WrapperERC20.

- depositWithPermit: habilita el depósito utilizando permisos EIP-2612, lo que permite autorizar a un usuario y al contrato a depositar tokens en su nombre.

- withdraw: permite canjear WrapperERC20 y recibir nuevamente el token subyacente original.

#### Tests
Se desarrolló un suite de pruebas unitarias que cubre:

- El correcto funcionamiento de cada función del WrapperFactory y WrapperERC20.

- El manejo de errores y validaciones esperadas en distintos escenarios.

- El proceso de upgrade del contrato WrapperFactory, agregando nuevas variables y funciones. 

## Instalación

```shell
npm install
```

## Compilación

```shell
npx hardhat compile
```

## Test
```shell
npx hardhat test
```

