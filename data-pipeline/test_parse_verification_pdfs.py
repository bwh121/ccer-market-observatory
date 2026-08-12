import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from parse_verification_pdfs import parse_basic_fields, parse_targets, parse_targets_from_tables


SAMPLE_TEXT = """
技术服务机构信息公开表
（2023年度核查）
一、技术服务机构基本信息
技术服务机构
名称 上海环科环境认证有限公司
统一社会信用
代码
913101047449
23836T 法定代表人 舒伟
注册资金(万元) 300万人民币 办公场所
上海市徐汇区钦州路508号
联系人 张三 联系方式（电话、email） 13917108490 test@example.com
二、技术服务机构内部管理情况
不良记录 无。
三、核查工作及时性和工作质量
序号 重点排放单位名称
7其他内容
1
上海东冠
纸业有限
公司
91310
00074
76425
54R
及时 符合 符合 符合 符合 符合 符合 符合
2
测试能源
有限公司
91310
00000
00000
001
不及时 不符合 符合 符合 符合 符合 符合 符合
共出具 2份《核查结论》。其中：1份合格，1份不合格，合格率 50.0 %。
"""


class VerificationPdfParserTests(unittest.TestCase):
    def setUp(self):
        self.lines = [line.strip() for line in SAMPLE_TEXT.splitlines() if line.strip()]

    def test_parses_required_basic_fields_and_summary(self):
        basic = parse_basic_fields(SAMPLE_TEXT, self.lines)
        self.assertEqual(basic["year"], 2023)
        self.assertEqual(basic["institution_name"], "上海环科环境认证有限公司")
        self.assertEqual(basic["unified_social_credit_code"], "91310104744923836T")
        self.assertEqual(basic["legal_representative"], "舒伟")
        self.assertEqual(basic["registered_capital_amount"], 300)
        self.assertEqual(basic["office_address"], "上海市徐汇区钦州路508号")
        self.assertEqual(basic["contact_name"], "张三")
        self.assertIn("13917108490", basic["contact_details"])
        self.assertEqual(basic["bad_record"], "无")
        self.assertEqual(basic["target_count"], 2)
        self.assertEqual(basic["pass_rate"], 0.5)

    def test_parses_target_rows_and_negative_flags(self):
        targets = parse_targets(self.lines, 2)
        self.assertEqual(len(targets), 2)
        self.assertEqual(targets[0]["target_entity_name"], "上海东冠纸业有限公司")
        self.assertEqual(targets[0]["target_uscc"], "91310000747642554R")
        self.assertEqual(targets[0]["timeliness"], "及时")
        self.assertEqual(targets[0]["result"], "符合")
        self.assertEqual(targets[1]["timeliness"], "不及时")
        self.assertEqual(targets[1]["result"], "不符合")

    def test_table_parser_merges_unnumbered_rows_across_pages_and_normalizes_uscc(self):
        tables = [
            [["序号", "重点排放单位名称", "统一社会信用代码", "核查及时性"]],
            [["", "跨页企", "91340100MA", "及时", "符合"]],
            [["", "业有限公司", "2n09fl3r", "", ""]],
            [["", "第二企业", "913402007300268946", "及时", "符合"]],
        ]

        class FakePage:
            def __init__(self, table):
                self.table = table

            def extract_tables(self):
                return [self.table]

        class FakeDocument:
            pages = [FakePage(table) for table in tables]

            def __enter__(self):
                return self

            def __exit__(self, *_):
                return None

        with TemporaryDirectory() as directory, patch(
            "parse_verification_pdfs.pdfplumber.open", return_value=FakeDocument()
        ):
            targets = parse_targets_from_tables(Path(directory) / "sample.pdf")

        self.assertEqual(len(targets), 2)
        self.assertEqual(targets[0]["target_entity_name"], "跨页企业有限公司")
        self.assertEqual(targets[0]["target_uscc"], "91340100MA2N09FL3R")
        self.assertEqual(targets[1]["target_order"], 2)


if __name__ == "__main__":
    unittest.main()
