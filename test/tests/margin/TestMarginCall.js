const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const Margin = artifacts.require("Margin");
const TestMarginCallDelegator = artifacts.require("TestMarginCallDelegator");
const {
  doOpenPosition,
  getPosition,
  doOpenPositionAndCall
} = require('../../helpers/MarginHelper');
const { expectThrow } = require('../../helpers/ExpectHelper');
const { expectLog } = require('../../helpers/EventHelper');
const { getBlockTimestamp } = require('../../helpers/NodeHelper');
const { ADDRESSES } = require('../../helpers/Constants');

function getCallTimestamp(tx) {
  return getBlockTimestamp(tx.receipt.blockNumber)
}

describe('#marginCall', () => {
  const REQUIRED_DEPOSIT = new BigNumber(10);
  let detaMargin;

  async function marginCall(
    openTx,
    deposit = REQUIRED_DEPOSIT,
    from = openTx.loanOffering.owner
  ) {
    const [lender, trader] = await Promise.all([
      detaMargin.getPositionLender.call(openTx.id),
      detaMargin.getPositionOwner.call(openTx.id)
    ]);
    const tx = await detaMargin.marginCall(
      openTx.id,
      deposit,
      { from: from}
    );
    expectLog(tx.logs[0], 'MarginCallInitiated', {
      positionId: openTx.id,
      lender: lender,
      owner: trader,
      requiredDeposit: deposit
    });

    const positionCalledTimestamp = await getCallTimestamp(tx);

    const {
      callTimestamp,
      requiredDeposit
    } = await getPosition(detaMargin, openTx.id);

    expect(callTimestamp).to.be.bignumber.equal(positionCalledTimestamp);
    expect(requiredDeposit).to.be.bignumber.equal(deposit);

    return tx;
  }

  contract('Margin', accounts => {
    it('sets callTimestamp and requiredDeposit on the position', async () => {
      detaMargin = await Margin.deployed();
      const openTx = await doOpenPosition(accounts);

      const tx = await marginCall(openTx, REQUIRED_DEPOSIT);

      console.log('\tMargin.marginCall gas used: ' + tx.receipt.gasUsed);
    });
  });

  contract('Margin', accounts => {
    it('prevents unauthorized accounts from calling', async () => {
      detaMargin = await Margin.deployed();
      const openTx = await doOpenPosition(accounts);

      await expectThrow(detaMargin.marginCall(
        openTx.id,
        REQUIRED_DEPOSIT,
        { from: accounts[6] }
      ));

      const { callTimestamp } = await getPosition(detaMargin, openTx.id);

      expect(callTimestamp).to.be.bignumber.equal(0);
    });
  });

  contract('Margin', accounts => {
    it('MarginCallDelegator loan owner only allows certain accounts', async () => {
      detaMargin = await Margin.deployed();
      const openTx = await doOpenPosition(accounts);
      const caller = accounts[8];
      const loanCaller = await TestMarginCallDelegator.new(
        Margin.address,
        caller,
        ADDRESSES.ZERO);
      await detaMargin.transferLoan(
        openTx.id,
        loanCaller.address,
        { from: openTx.loanOffering.payer }
      );
      let position = await getPosition(detaMargin, openTx.id);
      expect(position.callTimestamp).to.be.bignumber.equal(0);

      await expectThrow(detaMargin.marginCall(
        openTx.id,
        REQUIRED_DEPOSIT,
        { from: accounts[6] }
      ));
      position = await getPosition(detaMargin, openTx.id);
      expect(position.callTimestamp).to.be.bignumber.equal(0);

      await marginCall(
        openTx,
        REQUIRED_DEPOSIT,
        caller
      );
    });
  });

  contract('Margin', accounts => {
    it('fails if the loan has already been called', async () => {
      detaMargin = await Margin.deployed();
      const openTx = await doOpenPosition(accounts);

      await marginCall(openTx);

      await expectThrow(detaMargin.marginCall(
        openTx.id,
        REQUIRED_DEPOSIT.plus(REQUIRED_DEPOSIT),
        { from: openTx.loanOffering.payer }
      ));
    });
  });
});

describe('#cancelMarginCall', () => {
  let detaMargin;

  async function cancelMarginCall(
    openTx,
    from = openTx.loanOffering.owner
  ) {
    const [lender, trader] = await Promise.all([
      detaMargin.getPositionLender.call(openTx.id),
      detaMargin.getPositionOwner.call(openTx.id)
    ]);
    const tx = await detaMargin.cancelMarginCall(
      openTx.id,
      { from: from }
    );
    expectLog(tx.logs[0], 'MarginCallCanceled', {
      positionId: openTx.id,
      lender: lender,
      owner: trader,
      depositAmount: 0
    });

    const {
      callTimestamp,
      requiredDeposit
    } = await getPosition(detaMargin, openTx.id);

    expect(callTimestamp).to.be.bignumber.equal(0);
    expect(requiredDeposit).to.be.bignumber.equal(0);

    return tx;
  }

  contract('Margin', accounts => {
    it('unsets callTimestamp and requiredDeposit on the position', async () => {
      detaMargin = await Margin.deployed();
      const { openTx } = await doOpenPositionAndCall(accounts);

      const tx = await cancelMarginCall(openTx);

      console.log('\tMargin.cancelMarginCall gas used: ' + tx.receipt.gasUsed);
    });
  });

  contract('Margin', accounts => {
    it('prevents unauthorized accounts from cancelling', async () => {
      detaMargin = await Margin.deployed();
      const { openTx, callTx } = await doOpenPositionAndCall(accounts);

      const positionCalledTimestamp = await getCallTimestamp(callTx);

      await expectThrow(detaMargin.cancelMarginCall(
        openTx.id,
        { from: accounts[6] }
      ));

      const { callTimestamp } = await getPosition(detaMargin, openTx.id);

      expect(callTimestamp).to.be.bignumber.equal(positionCalledTimestamp);
    });
  });

  contract('Margin', accounts => {
    it('fails if the loan has not been called', async () => {
      detaMargin = await Margin.deployed();
      const openTx = await doOpenPosition(accounts);

      await expectThrow(detaMargin.cancelMarginCall(
        openTx.id,
        { from: openTx.loanOffering.payer }
      ));
    });
  });

  contract('Margin', accounts => {
    it('MarginCallDelegator loan owner only allows certain accounts', async () => {
      detaMargin = await Margin.deployed();
      const { openTx } = await doOpenPositionAndCall(accounts);
      const canceler = accounts[9];
      const loanCaller = await TestMarginCallDelegator.new(
        Margin.address,
        ADDRESSES.ZERO,
        canceler);
      await detaMargin.transferLoan(
        openTx.id,
        loanCaller.address,
        { from: openTx.loanOffering.payer }
      );
      let position = await getPosition(detaMargin, openTx.id);
      expect(position.callTimestamp).to.be.bignumber.not.equal(0);

      await expectThrow(detaMargin.cancelMarginCall(
        openTx.id,
        { from: accounts[6] }
      ));
      position = await getPosition(detaMargin, openTx.id);
      expect(position.callTimestamp).to.be.bignumber.not.equal(0);

      await cancelMarginCall(openTx, canceler);
    });
  });
});
