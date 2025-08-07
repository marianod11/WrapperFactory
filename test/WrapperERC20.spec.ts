import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

describe("WrapperERC20", function () {
    async function deployWrapperERC20Fixture() {
        const [owner, admin, operator, treasurer, user, feeReceiver, otherAccount] = await ethers.getSigners();

        const USDTTestToken = await ethers.getContractFactory("BaseToken");
        const usdtTestToken = await USDTTestToken.deploy("USDT", "USDT");
        await usdtTestToken.waitForDeployment();

        const WrapperERC20 = await ethers.getContractFactory("WrapperERC20");
        const wrapperImplementation = await WrapperERC20.deploy();
        await wrapperImplementation.waitForDeployment();

        const fee = 100n;

        const WrapperFactory = await ethers.getContractFactory("WrapperFactory");
        const factory = await upgrades.deployProxy(
            WrapperFactory,
            [admin.address, operator.address, treasurer.address, feeReceiver.address, fee],
            { initializer: "initialize", kind: "uups" }
        );
        await factory.waitForDeployment();

        (await factory.connect(admin).setImplementation(wrapperImplementation.target)).wait();

        (await factory.connect(user).deployWrappedToken(usdtTestToken.target)).wait();

        const wrappedTokens = await factory.getWrappedTokens();
        const wrapper = await ethers.getContractAt("WrapperERC20", wrappedTokens[0]);

        await usdtTestToken.transfer(user.address, ethers.parseEther("1000"));

        return { wrapper, usdtTestToken, factory, owner, user, admin, feeReceiver, otherAccount, fee, wrapperImplementation }
    }

    describe("Initialization", function () {
        it("Should set correct token name and symbol", async function () {
            const { wrapper } = await loadFixture(deployWrapperERC20Fixture);

            expect(await wrapper.name()).to.equal("Wrapped-USDT");
            expect(await wrapper.symbol()).to.equal("W-USDT");
        });

        it("Should set correct underlying token and factory", async function () {
            const { wrapper, usdtTestToken, factory } = await loadFixture(deployWrapperERC20Fixture);

            expect(await wrapper.underlyingToken()).to.equal(usdtTestToken.target);
            expect(await wrapper.factory()).to.equal(factory.target);
        });

        it("Should revert with InvalidUnderlyingToken if address(0)", async function () {
            const WrapperERC20 = await ethers.getContractFactory("WrapperERC20");
            await expect(
                upgrades.deployProxy(
                    WrapperERC20,
                    [ethers.ZeroAddress, ethers.ZeroAddress, "Invalid", "INV"],
                    { initializer: "initialize" }
                )
            ).to.be.revertedWithCustomError(WrapperERC20, "InvalidUnderlyingToken");
        });

        it("Should revert with InvalidFactory if address(0)", async function () {
            const USDTTestToken = await ethers.getContractFactory("BaseToken");
            const usdtTestToken = await USDTTestToken.deploy("USDT", "USDT");
            await usdtTestToken.waitForDeployment();

            const WrapperERC20 = await ethers.getContractFactory("WrapperERC20");
            await expect(
                upgrades.deployProxy(
                    WrapperERC20,
                    [usdtTestToken.target, ethers.ZeroAddress, "Invalid", "INV"],
                    { initializer: "initialize" }
                )
            ).to.be.revertedWithCustomError(WrapperERC20, "InvalidFactory");
        });
    });

    describe("Deposit Functionality", function () {
        it("Should mint wrapped tokens on deposit", async function () {
            const { wrapper, usdtTestToken, user, feeReceiver, fee } = await loadFixture(deployWrapperERC20Fixture);

            const depositAmount = ethers.parseEther("100");
            await usdtTestToken.connect(user).approve(wrapper.target, depositAmount);

            await expect(wrapper.connect(user).deposit(depositAmount))
                .to.emit(wrapper, "Deposit")
                .withArgs(user.address, depositAmount, depositAmount / fee, depositAmount - (depositAmount / fee), feeReceiver.address);

            expect(await wrapper.balanceOf(user.address)).to.equal(depositAmount - (depositAmount / fee));
            expect(await usdtTestToken.balanceOf(wrapper.target)).to.equal(depositAmount - (depositAmount / fee));
        });

        it("Should charge correct fee on deposit", async function () {
            const { wrapper, usdtTestToken, user, feeReceiver, fee } = await loadFixture(deployWrapperERC20Fixture);

            const depositAmount = ethers.parseEther("100");
            const expectedFee = depositAmount / fee;
            const expectedNetAmount = depositAmount - expectedFee;

            await usdtTestToken.connect(user).approve(wrapper.target, depositAmount);
            await wrapper.connect(user).deposit(depositAmount);

            expect(await wrapper.balanceOf(user.address)).to.equal(expectedNetAmount);
            expect(await usdtTestToken.balanceOf(feeReceiver.address)).to.equal(expectedFee);
        });

        it("Should revert with ZeroAmount if depositing 0", async function () {
            const { wrapper, user } = await loadFixture(deployWrapperERC20Fixture);

            await expect(wrapper.connect(user).deposit(0))
                .to.be.revertedWithCustomError(wrapper, "ZeroAmount");
        });

        it("Should revert with ERC20InsufficientAllowance if transferFrom fails", async function () {
            const { wrapper, user } = await loadFixture(deployWrapperERC20Fixture);
            await expect(wrapper.connect(user).deposit(ethers.parseEther("100")))
                .to.be.revertedWithCustomError(wrapper, "ERC20InsufficientAllowance");
        });

        it("Should work with permit functionality", async function () {
            const { wrapper, usdtTestToken, user, owner, fee } = await loadFixture(deployWrapperERC20Fixture);

            const depositAmount = ethers.parseEther("100");
            const deadline = Math.floor(Date.now() / 1000) + 3600; 

            const nonce = await usdtTestToken.nonces(owner.address);

            const domain = {
                name: await usdtTestToken.name(),
                version: "1", 
                chainId: (await ethers.provider.getNetwork()).chainId,
                verifyingContract: await usdtTestToken.getAddress(),
            };

            const types = {
                Permit: [
                    { name: "owner", type: "address" },
                    { name: "spender", type: "address" },
                    { name: "value", type: "uint256" },
                    { name: "nonce", type: "uint256" },
                    { name: "deadline", type: "uint256" },
                ],
            };

            const values = {
                owner: owner.address,
                spender: await wrapper.getAddress(),
                value: depositAmount,
                nonce,
                deadline,
            };

            const signature = await owner.signTypedData(domain, types, values);
            const { v, r, s } = ethers.Signature.from(signature);

            await expect(
                wrapper.connect(user).depositWithPermit(
                    owner.address,
                    user.address,
                    depositAmount,
                    deadline,
                    v,
                    r,
                    s
                )
            ).to.emit(wrapper, "Deposit");

            const allowance = await usdtTestToken.allowance(owner.address, await wrapper.getAddress());
            expect(allowance).to.equal(0);

            const feeDenominator = await wrapper.FEE_DENOMINATOR();

            const feeAmount = depositAmount * fee / feeDenominator;
            const expectedBalance = depositAmount - feeAmount;

            const balance = await wrapper.balanceOf(user.address);
            expect(balance).to.equal(expectedBalance);
        });
    });

    describe("Withdraw Functionality", function () {
        it("Should burn wrapped tokens and return underlying on withdraw", async function () {
            const { wrapper, usdtTestToken, user, fee } = await loadFixture(deployWrapperERC20Fixture);

            const depositAmount = ethers.parseEther("100");
            const initialBalance = await usdtTestToken.balanceOf(user.address);

            await (await usdtTestToken.connect(user).approve(wrapper.target, depositAmount)).wait();
            await (await wrapper.connect(user).deposit(depositAmount)).wait();

            const wrappedBalance = await wrapper.balanceOf(user.address);
            expect(wrappedBalance).to.be.gt(0);

            await expect(wrapper.connect(user).withdraw(wrappedBalance))
                .to.emit(wrapper, "Withdrawal")
                .withArgs(user.address, wrappedBalance, wrappedBalance);

            expect(await wrapper.balanceOf(user.address)).to.equal(0);
            expect(await usdtTestToken.balanceOf(user.address)).to.be.closeTo(
                initialBalance,
                depositAmount / fee
            );
        });

        it("Should revert with ZeroAmount if withdrawing 0", async function () {
            const { wrapper, user } = await loadFixture(deployWrapperERC20Fixture);

            await expect(wrapper.connect(user).withdraw(0))
                .to.be.revertedWithCustomError(wrapper, "ZeroAmount");
        });

        it("Should revert with InvalidAmount if insufficient balance", async function () {
            const { wrapper, user } = await loadFixture(deployWrapperERC20Fixture);

            await expect(wrapper.connect(user).withdraw(1))
                .to.be.revertedWithCustomError(wrapper, "InsufficientBalance");
        });

        it("Should revert with TransferFailed if transfer fails", async function () {
            const { wrapper, usdtTestToken, user } = await loadFixture(deployWrapperERC20Fixture);

            const depositAmount = ethers.parseEther("100");
            await usdtTestToken.connect(user).approve(wrapper.target, depositAmount);
            await wrapper.connect(user).deposit(depositAmount);

            await usdtTestToken.transfer(user.address, await usdtTestToken.balanceOf(wrapper.target));

            await expect(wrapper.connect(user).withdraw(await wrapper.balanceOf(user.address) + 1n))
                .to.be.revertedWithCustomError(wrapper, "InsufficientBalance");
        });
    });

    describe("Utility Functions", function () {
        it("Should return correct total underlying balance", async function () {
            const { wrapper, usdtTestToken, user, fee } = await loadFixture(deployWrapperERC20Fixture);

            const depositAmount = ethers.parseEther("100");
            await usdtTestToken.connect(user).approve(wrapper.target, depositAmount);
            await wrapper.connect(user).deposit(depositAmount);

            const expectedBalance = depositAmount - (depositAmount / fee);
            expect(await wrapper.totalUnderlying()).to.equal(expectedBalance);
        });

        it("Should get correct fee from factory", async function () {
            const { usdtTestToken, user, wrapper, fee } = await loadFixture(deployWrapperERC20Fixture);
            const depositAmount = ethers.parseEther("100");
            await usdtTestToken.connect(user).approve(wrapper.target, depositAmount);
            await wrapper.connect(user).deposit(depositAmount);

            const expectedFee = depositAmount / fee;
            const expectedNetAmount = depositAmount - expectedFee;
            expect(await wrapper.balanceOf(user.address)).to.equal(expectedNetAmount);
        });

        it("Should get correct fee receiver from factory", async function () {
            const { wrapper, feeReceiver, user, usdtTestToken } = await loadFixture(deployWrapperERC20Fixture);

            const depositAmount = ethers.parseEther("100");
            await usdtTestToken.connect(user).approve(wrapper.target, depositAmount);
            await wrapper.connect(user).deposit(depositAmount);

            const expectedFee = depositAmount / 100n;
            expect(await usdtTestToken.balanceOf(feeReceiver.address)).to.equal(expectedFee);
        });
    });
});