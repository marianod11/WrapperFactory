import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";


describe("WrapperFactory", function () {

  async function deployInitializedWrapperFactoryFixture() {
    const [admin, operator, treasurer, user, feeReceiver, otherAccount] = await ethers.getSigners();


    const WrapperERC20 = await ethers.getContractFactory("WrapperERC20");
    const wrapperImplementation = await WrapperERC20.deploy();
    await wrapperImplementation.waitForDeployment();

    const WrapperFactory = await ethers.getContractFactory("WrapperFactory");
    const factory = await upgrades.deployProxy(
      WrapperFactory,
      [
        admin.address,
        operator.address,
        treasurer.address,
        feeReceiver.address,
        100n
      ],
      {
        initializer: "initialize(address,address,address,address,uint256)",
        kind: "uups"
      }
    );

    await factory.setImplementation(wrapperImplementation.target);

    const BaseToken = await ethers.getContractFactory("BaseToken");
    const usdtTokenTest = await BaseToken.deploy("USDT", "USDT");
    await usdtTokenTest.waitForDeployment();

    return { factory, admin, operator, treasurer, user, otherAccount, feeReceiver, usdtTokenTest, wrapperImplementation };
  }

  describe("Initialization", function () {
    it("Should initialize with correct roles", async function () {
      const { factory, admin, operator, treasurer } = await loadFixture(deployInitializedWrapperFactoryFixture);

      expect(await factory.hasRole(await factory.ADMINISTRATOR_ROLE(), admin.address)).to.be.true;
      expect(await factory.hasRole(await factory.OPERATOR_ROLE(), operator.address)).to.be.true;
      expect(await factory.hasRole(await factory.TREASURER_ROLE(), treasurer.address)).to.be.true;
    });

    it("Should set correct role admins", async function () {
      const { factory } = await loadFixture(deployInitializedWrapperFactoryFixture);

      expect(await factory.getRoleAdmin(await factory.OPERATOR_ROLE())).to.equal(await factory.ADMINISTRATOR_ROLE());
      expect(await factory.getRoleAdmin(await factory.TREASURER_ROLE())).to.equal(await factory.ADMINISTRATOR_ROLE());
    });

    it("Should set initial fee and fee receiver", async function () {
      const { factory, feeReceiver } = await loadFixture(deployInitializedWrapperFactoryFixture);

      expect(await factory.getDepositFee()).to.equal(100);
      expect(await factory.getFeeReceiver()).to.equal(feeReceiver.address);
    });

    it("Should not allow re-initialization", async function () {
      const { factory, admin } = await loadFixture(deployInitializedWrapperFactoryFixture);

      await expect(
        factory.initialize(admin.address, admin.address, admin.address, admin.address, 100)
      ).to.be.revertedWithCustomError(factory, "InvalidInitialization");
    });
  });

  describe("Wrapped Token Creation", function () {
    it("Should create a new wrapped token", async function () {
      const { factory, user , usdtTokenTest} = await loadFixture(deployInitializedWrapperFactoryFixture);

      await expect(factory.connect(user).deployWrappedToken(usdtTokenTest.target))
        .to.emit(factory, "WrappedTokenCreate")

      const wrappedTokens = await factory.getWrappedTokens();
      expect(wrappedTokens.length).to.equal(1);
    });

    it("Should not allow wrapping address(0)", async function () {
      const { factory, user } = await loadFixture(deployInitializedWrapperFactoryFixture);

      await expect(factory.connect(user).deployWrappedToken(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(factory, "ZeroAddress");
    });

    it("Should not allow wrapping the same token twice", async function () {
      const { factory, user, usdtTokenTest } = await loadFixture(deployInitializedWrapperFactoryFixture);

      await factory.connect(user).deployWrappedToken(usdtTokenTest.target);
      await expect(factory.connect(user).deployWrappedToken(usdtTokenTest.target))
        .to.be.revertedWithCustomError(factory, "TokenAlreadyWrapped");
    });
  });

  describe("Fee Configuration", function () {
    it("Should allow treasurer to change fee receiver", async function () {
      const { factory, treasurer, otherAccount } = await loadFixture(deployInitializedWrapperFactoryFixture);

      await expect(factory.connect(treasurer).setFeeReceiver(otherAccount.address))
        .to.emit(factory, "FeeReceiverChanged")
        .withArgs(otherAccount.address);

      expect(await factory.getFeeReceiver()).to.equal(otherAccount.address);
    });

    it("Should not allow non-treasurer to change fee receiver", async function () {
      const { factory, user, otherAccount } = await loadFixture(deployInitializedWrapperFactoryFixture);

      await expect(factory.connect(user).setFeeReceiver(otherAccount.address))
        .to.be.revertedWithCustomError(factory, "AccessControlUnauthorizedAccount");
    });

    it("Should allow operator to change deposit fee", async function () {
      const { factory, operator } = await loadFixture(deployInitializedWrapperFactoryFixture);

      const newFee = 500;
      await expect(factory.connect(operator).setDepositFee(newFee))
        .to.emit(factory, "DepositFeeChanged")
        .withArgs(newFee);

      expect(await factory.getDepositFee()).to.equal(newFee);
    });

    it("Should not allow fee higher than MAX_FEE", async function () {
      const { factory, operator } = await loadFixture(deployInitializedWrapperFactoryFixture);

      const maxFee = await factory.MAX_FEE();
      await expect(factory.connect(operator).setDepositFee(maxFee + 1n))
        .to.be.revertedWithCustomError(factory, "FeeTooHigh");
    });

    it("Should not allow non-operator to change deposit fee", async function () {
      const { factory, user } = await loadFixture(deployInitializedWrapperFactoryFixture);

      await expect(factory.connect(user).setDepositFee(500))
        .to.be.revertedWithCustomError(factory, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Role Management", function () {
    it("Should allow admin to grant roles", async function () {
      const { factory, admin, otherAccount } = await loadFixture(deployInitializedWrapperFactoryFixture);

      const OPERATOR_ROLE = await factory.OPERATOR_ROLE();
      await expect(factory.connect(admin).grantRole(OPERATOR_ROLE, otherAccount.address))
        .to.emit(factory, "RoleGranted(bytes32,address,address)")
        .withArgs(OPERATOR_ROLE, otherAccount.address, admin.address);

      expect(await factory.hasRole(OPERATOR_ROLE, otherAccount.address)).to.be.true;
    });

    it("Should allow admin to revoke roles", async function () {
      const { factory, admin, operator } = await loadFixture(deployInitializedWrapperFactoryFixture);

      const OPERATOR_ROLE = await factory.OPERATOR_ROLE();
      await expect(factory.connect(admin).revokeRole(OPERATOR_ROLE, operator.address))
        .to.emit(factory, "RoleRevoked(bytes32,address,address)")
        .withArgs(OPERATOR_ROLE, operator.address, admin.address);

      expect(await factory.hasRole(OPERATOR_ROLE, operator.address)).to.be.false;
    });

    it("Should not allow granting invalid roles", async function () {
      const { factory, admin, otherAccount } = await loadFixture(deployInitializedWrapperFactoryFixture);

      const invalidRole = ethers.keccak256(ethers.toUtf8Bytes("INVALID_ROLE"));
      await expect(factory.connect(admin).grantRole(invalidRole, otherAccount.address))
        .to.be.revertedWith("Invalid role");
    });
  });

  describe("UUPS Upgrade FACTORY", function () {
    it("Should allow owner to upgrade contract", async function () {
      const { factory } = await loadFixture(deployInitializedWrapperFactoryFixture);

      const MockWrapperFactoryV2= await ethers.getContractFactory("MockWrapperFactoryV2"); 


      const factoryV2 = await upgrades.upgradeProxy(factory.target, MockWrapperFactoryV2, {
          kind: "uups",
        })

        await factoryV2.setVersion("2.0.0");
 
      expect(await factoryV2.testProxy()).to.equal("2.0.0"); 
    });
  });
});